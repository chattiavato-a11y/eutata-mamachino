// l6_orchestrator.js
// Flow: L5 extractive → (low confidence) WebLLM/WebGPU → (if mode allows) server /api/chat
// Enforces session token budget (soft=75k, hard=100k).

import { L5Local } from './l5_local_llm.js';
import { WebLLM } from './l5_webllm.js';

const Budget = {
  soft: 75000,
  hard: 100000,
  spent: 0,
  approxTokens(s){ return Math.ceil((s||'').length / 4); }, // ~4 chars/token heuristic
  canSpend(n){ return (this.spent + n) <= this.hard; },
  note(n){ this.spent += Math.max(0, n|0); }
};

function groundedSystem({ lang, strong }){
  const ctx = (strong||[]).map(t => `[#${t.id}] ${t.text}`).join('\n');
  const policy = (lang==='es')
    ? 'Responde SOLO con el contexto. Si falta info, dilo. Cita [#id] en afirmaciones.'
    : "Answer ONLY using the context. If info is missing, say so. Cite [#id] for claims.";
  const style = (lang==='es') ? 'Sé conciso y claro.' : 'Be concise and clear.';
  return `${policy}\n${style}\n\nContext:\n${ctx}`;
}

// Minimal helper to re-derive "strong" chunks client-side for WebLLM grounding.
async function deriveStrong({ query, lang }){
  try {
    const r = await fetch('/packs/site-pack.json'); if (!r.ok) return [];
    const pack = await r.json();
    const tok = s => (s||'').toLowerCase().normalize('NFKC').match(/[a-z0-9áéíóúüñ]+/gi)||[];
    const terms = tok(query);
    const docs = []; for (const d of pack.docs||[]) for (const c of d.chunks||[])
      if (!lang || !d.lang || d.lang===lang) docs.push({ id:c.id, text:c.text, t:tok(c.text) });
    const score = d => terms.reduce((s,w)=> s + (d.t.includes(w) ? 1 : 0), 0);
    return docs.map(d=>({...d,score:score(d)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4);
  } catch { return []; }
}

// Try local extractive (L5). Returns {ok, text} or {ok:false}
async function tryExtractive({ query, lang, ui }){
  ui.statusEl.textContent = 'Thinking locally…';
  const text = await L5Local.draft({ query, lang, bm25Min:0.6, coverageNeeded:2 });
  if (!text) return { ok:false };
  // stream locally (simulated) and budget
  ui.statusEl.textContent = 'Streaming (local)…';
  const aiEl = ui.addMsg('assistant','');
  let i=0; const step = () => {
    if (i < text.length){
      const chunk = text[i++]; aiEl.textContent += chunk; ui.chatEl.scrollTop = ui.chatEl.scrollHeight;
      return setTimeout(step, 8);
    } else {
      const toks = Budget.approxTokens(text); Budget.note(toks);
      ui.statusEl.textContent = `Ready. (≈${Budget.spent} tokens)`;
      return;
    }
  }; step();
  return { ok:true, text };
}

// Try WebLLM on GPU (only if low confidence)
async function tryWebGPU({ query, lang, ui, modelId }){
  ui.statusEl.textContent = 'Loading local model…';
  await WebLLM.load({
    model: modelId || 'Llama-3.1-8B-Instruct-q4f16_1',
    progress: (p)=>{ ui.statusEl.textContent = `Loading local model… ${Math.round((p?.progress||0)*100)}%`; }
  });

  const strong = await deriveStrong({ query, lang });
  const sys = groundedSystem({ lang, strong });

  ui.statusEl.textContent = 'Streaming (local GPU)…';
  const aiEl = ui.addMsg('assistant','');
  let tokensStreamed = 0;
  const out = await WebLLM.generate({
    prompt: query,
    system: sys,
    onToken: (tok)=>{
      // stop if we’d exceed hard budget
      const t = Budget.approxTokens(tok);
      if (!Budget.canSpend(t)) return;
      tokensStreamed += t;
      aiEl.textContent += tok;
      ui.chatEl.scrollTop = ui.chatEl.scrollHeight;
    }
  });
  Budget.note(tokensStreamed);
  ui.statusEl.textContent = `Ready. (≈${Budget.spent} tokens)`;
  return out;
}

// Server fallback (/api/chat) with budget guard
async function tryServer({ state, ui }){
  ui.statusEl.textContent='Connecting…';
  const res = await fetch('/api/chat', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','X-CSRF':state.csrf, 'X-Session-Tokens-Spent': String(Budget.spent) },
    body: JSON.stringify({ messages: state.messages.slice(-16), lang: state.lang, csrf: state.csrf, hp: state.hp||'' })
  });
  if (!res.ok || !res.body){ ui.statusEl.textContent='Server error.'; return ''; }

  ui.statusEl.textContent='Streaming…';
  const reader=res.body.getReader(); const dec=new TextDecoder();
  const aiEl=ui.addMsg('assistant',''); let text='';
  while(true){
    const {value, done}=await reader.read(); if(done) break;
    const chunk=dec.decode(value,{stream:true});
    for (const line of chunk.split('\n')){
      if(!line.startsWith('data: ')) continue;
      const data=line.slice(6); if(data==='[END]') break;
      // budget guard on server stream too
      if (!Budget.canSpend(Budget.approxTokens(data))) { ui.warnEl.textContent='Session token cap reached.'; continue; }
      text+=data; aiEl.textContent=text; ui.chatEl.scrollTop=ui.chatEl.scrollHeight;
      Budget.note(Budget.approxTokens(data));
    }
  }
  ui.statusEl.textContent=`Ready. (≈${Budget.spent} tokens)`;
  return text;
}

export async function routeChat({ ui, state }){
  const mode = state.mode || 'hybrid'; // 'local' | 'hybrid' | 'external'
  const lastUser = state.messages.filter(m=>m.role==='user').slice(-1)[0];
  const query = lastUser?.content || '';

  // Hard budget check upfront
  if (!Budget.canSpend(1)){
    ui.warnEl.textContent = 'Session token cap reached (100k).';
    return;
  }

  // 1) Local extractive always first
  const ex = await tryExtractive({ query, lang: state.lang, ui });
  if (ex.ok){
    state.messages.push({role:'assistant', content: ex.text});
    // Soft cap nudge
    if (Budget.spent >= Budget.soft && Budget.spent < Budget.hard){
      ui.warnEl.textContent = 'You are over the soft token cap (75k). Further generation will slow/trim.';
    }
    return;
  }

  // 2) Low confidence → try WebLLM/WebGPU if allowed by mode and GPU is available and budget permits
  if (mode !== 'external' && WebLLM.hasWebGPU() && Budget.canSpend(500)){ // need headroom
    try {
      const text = await tryWebGPU({ query, lang: state.lang, ui, modelId: state.webllmModel });
      if (text){
        state.messages.push({role:'assistant', content: text});
        if (Budget.spent >= Budget.soft && Budget.spent < Budget.hard){
          ui.warnEl.textContent = 'Soft cap exceeded (75k).';
        }
        return;
      }
    } catch (e){
      // ignore and drop to server path
      ui.warnEl.textContent = (String(e?.message||e).includes('webgpu'))
        ? 'WebGPU unavailable; using server fallback.'
        : 'Local model not available; using server fallback.';
    }
  }

  // 3) Server fallback if mode allows
  if (mode !== 'local'){
    if (!Budget.canSpend(1000)){ ui.warnEl.textContent = 'Insufficient budget for server call.'; return; }
    const text = await tryServer({ state, ui });
    if (text) state.messages.push({role:'assistant', content: text});
    return;
  }

  // 4) Local-only and nothing worked
  ui.statusEl.textContent = 'No local answer available.';
}

