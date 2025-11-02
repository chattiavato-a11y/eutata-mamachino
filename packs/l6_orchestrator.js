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

const sanitizeText = (()=>{
  if (typeof window !== 'undefined' && window.Shield && typeof window.Shield.baseSanitize === 'function'){
    return (value)=>window.Shield.baseSanitize(value || '');
  }
  return (value)=>String(value||'');
})();

const createGuardrails = () => ({
  warnings: [],
  notices: [],
  flags: [],
  budget: { softExceeded:false, hardExceeded:false },
  blocked:false
});

const mergeGuardrails = (target, next) => {
  if (!next) return target;
  if (Array.isArray(next.warnings)) target.warnings.push(...next.warnings);
  if (Array.isArray(next.notices)) target.notices.push(...next.notices);
  if (Array.isArray(next.flags)) target.flags.push(...next.flags);
  if (next.budget){
    target.budget.softExceeded = target.budget.softExceeded || !!next.budget.softExceeded;
    target.budget.hardExceeded = target.budget.hardExceeded || !!next.budget.hardExceeded;
  }
  if (next.blocked) target.blocked = true;
  return target;
};

const applyStatus = (ui, message) => {
  const safe = sanitizeText(message);
  if (ui?.setStatus){
    ui.setStatus(safe);
  } else if (ui?.statusEl){
    ui.statusEl.textContent = safe;
    if (ui.statusEl.dataset) ui.statusEl.dataset.active = safe ? 'true' : 'false';
  }
  return safe;
};

const applyWarn = (ui, message, level='warning') => {
  const safe = sanitizeText(message);
  if (ui?.setWarn){
    ui.setWarn(safe, level);
  } else if (ui?.warnEl){
    ui.warnEl.textContent = safe;
    if (ui.warnEl.dataset) ui.warnEl.dataset.level = safe ? level : '';
  }
  return safe;
};

const pushWarning = (state, ui, message, level='warning') => {
  const safe = sanitizeText(message);
  if (!safe) return null;
  if (!state.warnings.some(w => w.message === safe && w.level === level)){
    state.warnings.push({ message: safe, level });
  }
  applyWarn(ui, message, level);
  return safe;
};

const clearWarnings = (ui) => {
  applyWarn(ui, '', '');
};

const parseGuardPayload = (raw) => {
  const trimmed = (raw||'').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')){
    try { return JSON.parse(trimmed); }
    catch { return null; }
  }
  return null;
};

const resolveAssistantText = (payload) => {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object'){
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.output === 'string') return payload.output;
    if (Array.isArray(payload.choices) && payload.choices[0] && typeof payload.choices[0].text === 'string'){
      return payload.choices[0].text;
    }
  }
  return '';
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
  const guardrails = createGuardrails();
  applyStatus(ui, 'Thinking locally…');
  const text = await L5Local.draft({ query, lang, bm25Min:0.6, coverageNeeded:2 });
  if (!text) return { ok:false, guardrails };
  applyStatus(ui, 'Streaming (local)…');
  const aiEl = ui.addMsg('assistant','');
  let i=0;
  const finish = () => {
    const toks = Budget.approxTokens(text); Budget.note(toks);
    applyStatus(ui, `Ready. (≈${Budget.spent} tokens)`);
    if (ui?.focusAssistant) ui.focusAssistant(aiEl);
  };
  const step = () => {
    if (i < text.length){
      const chunk = text[i++]; aiEl.textContent += chunk; ui.chatEl.scrollTop = ui.chatEl.scrollHeight;
      return setTimeout(step, 8);
    }
    finish();
  };
  step();
  return { ok:true, text, guardrails };
}

// Try WebLLM on GPU (only if low confidence)
async function tryWebGPU({ query, lang, ui, modelId }){
  const guardrails = createGuardrails();
  applyStatus(ui, 'Loading local model…');
  await WebLLM.load({
    model: modelId || 'Llama-3.1-8B-Instruct-q4f16_1',
    progress: (p)=>{ applyStatus(ui, `Loading local model… ${Math.round((p?.progress||0)*100)}%`); }
  });

  const strong = await deriveStrong({ query, lang });
  const sys = groundedSystem({ lang, strong });

  applyStatus(ui, 'Streaming (local GPU)…');
  const aiEl = ui.addMsg('assistant','');
  let tokensStreamed = 0;
  let budgetWarned = false;
  const out = await WebLLM.generate({
    prompt: query,
    system: sys,
    onToken: (tok)=>{
      const t = Budget.approxTokens(tok);
      if (!Budget.canSpend(t)){
        guardrails.budget.hardExceeded = true;
        guardrails.blocked = true;
        if (!budgetWarned){
          pushWarning(guardrails, ui, 'Session token cap reached.', 'error');
          budgetWarned = true;
        }
        return;
      }
      tokensStreamed += t;
      aiEl.textContent += tok;
      ui.chatEl.scrollTop = ui.chatEl.scrollHeight;
    }
  });
  Budget.note(tokensStreamed);
  applyStatus(ui, `Ready. (≈${Budget.spent} tokens)`);
  if (ui?.focusAssistant) ui.focusAssistant(aiEl);
  return { text: out, guardrails };
}

// Server fallback (/api/chat) with budget guard
async function tryServer({ state, ui }){
  const guardrails = createGuardrails();
  applyStatus(ui,'Connecting…');
  let res;
  try {
    res = await fetch('/api/chat', {
      method:'POST',
      headers:{ 'Content-Type':'application/json','X-CSRF':state.csrf, 'X-Session-Tokens-Spent': String(Budget.spent) },
      body: JSON.stringify({ messages: state.messages.slice(-16), lang: state.lang, csrf: state.csrf, hp: state.hp||'' })
    });
  } catch (err){
    applyStatus(ui,'Network error.');
    guardrails.blocked = true;
    pushWarning(guardrails, ui, 'Unable to contact the server.', 'error');
    return { text:'', guardrails };
  }

  if (!res.ok || !res.body){
    applyStatus(ui,'Server error.');
    guardrails.blocked = true;
    pushWarning(guardrails, ui, 'Upstream response unavailable.', 'error');
    return { text:'', guardrails };
  }

  applyStatus(ui,'Streaming…');
  const reader=res.body.getReader(); const dec=new TextDecoder();
  const aiEl=ui.addMsg('assistant',''); let text='';
  let budgetWarned=false;
  while(true){
    const {value, done}=await reader.read(); if(done) break;
    const chunk=dec.decode(value,{stream:true});
    for (const line of chunk.split('\n')){
      if(!line.startsWith('data: ')) continue;
      const data=line.slice(6);
      if(!data) continue;
      if(data==='[END]') continue;

      if (data.startsWith('[WARN]')){
        pushWarning(guardrails, ui, data.replace('[WARN]','').trim(), 'warning');
        continue;
      }
      if (data.startsWith('[ERROR]')){
        guardrails.blocked = true;
        pushWarning(guardrails, ui, data.replace('[ERROR]','').trim(), 'error');
        continue;
      }

      const payload = parseGuardPayload(data);
      if (payload){
        if (typeof payload.status === 'string') applyStatus(ui, payload.status);
        if (payload.guardrail){
          const { level='warning', message='', code, blocked } = payload.guardrail;
          if (code) guardrails.flags.push(code);
          if (message) pushWarning(guardrails, ui, message, level);
          if (blocked) guardrails.blocked = true;
        }
        const token = typeof payload.token === 'string' ? payload.token : (typeof payload.text === 'string' ? payload.text : '');
        if (token){
          const tokenCost = Budget.approxTokens(token);
          if (!Budget.canSpend(tokenCost)){
            guardrails.budget.hardExceeded = true;
            guardrails.blocked = true;
            if (!budgetWarned){ pushWarning(guardrails, ui, 'Session token cap reached.', 'error'); budgetWarned=true; }
            continue;
          }
          text+=token; aiEl.textContent=text; ui.chatEl.scrollTop=ui.chatEl.scrollHeight;
          Budget.note(tokenCost);
        }
        continue;
      }

      const tokenCost = Budget.approxTokens(data);
      if (!Budget.canSpend(tokenCost)){
        guardrails.budget.hardExceeded = true;
        guardrails.blocked = true;
        if (!budgetWarned){ pushWarning(guardrails, ui, 'Session token cap reached.', 'error'); budgetWarned=true; }
        continue;
      }
      text+=data; aiEl.textContent=text; ui.chatEl.scrollTop=ui.chatEl.scrollHeight;
      Budget.note(tokenCost);
    }
  }
  applyStatus(ui,`Ready. (≈${Budget.spent} tokens)`);
  if (ui?.focusAssistant) ui.focusAssistant(aiEl);
  return { text, guardrails };
}

export async function routeChat({ ui, state }){
  const mode = state.mode || 'hybrid'; // 'local' | 'hybrid' | 'external'
  const lastUser = state.messages.filter(m=>m.role==='user').slice(-1)[0];
  const query = lastUser?.content || '';
  const guardrails = createGuardrails();
  const result = { source:'none', guardrails };

  // Hard budget check upfront
  if (!Budget.canSpend(1)){
    guardrails.budget.hardExceeded = true;
    guardrails.blocked = true;
    pushWarning(guardrails, ui, 'Session token cap reached (100k).', 'error');
    return result;
  }

  clearWarnings(ui);

  // 1) Local extractive always first
  const ex = await tryExtractive({ query, lang: state.lang, ui });
  mergeGuardrails(guardrails, ex.guardrails);
  if (ex.ok){
    state.messages.push({role:'assistant', content: ex.text});
    if (Budget.spent >= Budget.soft && Budget.spent < Budget.hard){
      guardrails.budget.softExceeded = true;
      pushWarning(guardrails, ui, 'You are over the soft token cap (75k). Further generation will slow/trim.', 'warning');
    } else {
      clearWarnings(ui);
    }
    return { source:'extractive', guardrails };
  }

  // 2) Low confidence → try WebLLM/WebGPU if allowed by mode and GPU is available and budget permits
  if (mode !== 'external' && WebLLM.hasWebGPU() && Budget.canSpend(500)){ // need headroom
    try {
      const web = await tryWebGPU({ query, lang: state.lang, ui, modelId: state.webllmModel });
      mergeGuardrails(guardrails, web.guardrails);
      const text = resolveAssistantText(web.text);
      if (text){
        state.messages.push({role:'assistant', content: text});
        if (Budget.spent >= Budget.soft && Budget.spent < Budget.hard){
          guardrails.budget.softExceeded = true;
          pushWarning(guardrails, ui, 'Soft cap exceeded (75k).', 'warning');
        }
        return { source:'webgpu', guardrails };
      }
    } catch (e){
      // ignore and drop to server path
      const msg = (String(e?.message||e).toLowerCase().includes('webgpu'))
        ? 'WebGPU unavailable; using server fallback.'
        : 'Local model not available; using server fallback.';
      pushWarning(guardrails, ui, msg, 'warning');
    }
  }

  // 3) Server fallback if mode allows
  if (mode !== 'local'){
    if (!Budget.canSpend(1000)){
      guardrails.budget.hardExceeded = true;
      guardrails.blocked = true;
      pushWarning(guardrails, ui, 'Insufficient budget for server call.', 'error');
      return { source:'blocked', guardrails };
    }
    const server = await tryServer({ state, ui });
    mergeGuardrails(guardrails, server.guardrails);
    const text = resolveAssistantText(server.text);
    if (text) state.messages.push({role:'assistant', content: text});
    if (!guardrails.warnings.length) clearWarnings(ui);
    return { source:'server', guardrails };
  }

  // 4) Local-only and nothing worked
  applyStatus(ui, 'No local answer available.');
  return result;
}

