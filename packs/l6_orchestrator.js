// l6_orchestrator.js
// Flow: L5 extractive → (low confidence) WebLLM/WebGPU → (if mode allows) server /api/chat
// Enforces session token budget (soft=75k, hard=100k).

import { L5Local } from './l5_local_llm.js';
import { WebLLM } from './l5_webllm.js';

function createGuardState(){
  return {
    warnings: [],
    errors: [],
    blocked: false,
    budget: {
      softExceeded: false,
      hardExceeded: false,
    }
  };
}

function clearWarnings(ui, guardrails){
  if (guardrails){
    guardrails.warnings = [];
    guardrails.errors = [];
    guardrails.blocked = false;
    if (guardrails.budget){
      guardrails.budget.softExceeded = false;
      guardrails.budget.hardExceeded = false;
    }
  }
  const warnEl = ui?.warnEl;
  if (warnEl){
    warnEl.textContent = '';
    warnEl.hidden = true;
    warnEl.removeAttribute?.('data-severity');
    delete warnEl.dataset.localeKey;
    delete warnEl.dataset.localeParams;
  }
}

function pushWarning(guardrails, ui, message, severity = 'warn', meta = {}){
  if (!guardrails) return;
  const entry = {
    message: message || '',
    severity,
    code: meta.code || null,
  };
  if (severity === 'error'){
    guardrails.errors.push(entry);
    guardrails.blocked = true;
  } else {
    guardrails.warnings.push(entry);
  }
  if (meta.code === 'budget.soft'){
    guardrails.budget.softExceeded = true;
  }
  if (meta.code === 'budget.hard'){
    guardrails.budget.hardExceeded = true;
    guardrails.blocked = true;
  }
  if (meta.blocked){
    guardrails.blocked = true;
  }

  const warnEl = ui?.warnEl;
  if (warnEl){
    delete warnEl.dataset.localeKey;
    delete warnEl.dataset.localeParams;
    warnEl.textContent = entry.message;
    warnEl.hidden = !entry.message;
    if (entry.message){
      warnEl.dataset.severity = severity;
    } else {
      warnEl.removeAttribute?.('data-severity');
    }
  }
}

function mergeGuardrails(target, source){
  if (!target || !source || target === source) return target || source;
  if (Array.isArray(source.warnings)){
    target.warnings.push(...source.warnings);
  }
  if (Array.isArray(source.errors)){
    target.errors.push(...source.errors);
  }
  target.blocked = Boolean(target.blocked || source.blocked);
  if (source.budget){
    target.budget.softExceeded = Boolean(target.budget.softExceeded || source.budget.softExceeded);
    target.budget.hardExceeded = Boolean(target.budget.hardExceeded || source.budget.hardExceeded);
  }
  return target;
}

const translate = (lang, key, params) => {
  const api = window.I18N;
  if (api && typeof api.t === 'function'){
    return api.t(lang, key, params);
  }
  return key;
};

const setText = (node, lang, key, params) => {
  if (!node) return;
  if (!key){
    delete node.dataset.localeKey;
    delete node.dataset.localeParams;
    node.textContent = '';
    return;
  }
  node.dataset.localeKey = key;
  if (params && Object.keys(params).length){
    try {
      node.dataset.localeParams = JSON.stringify(params);
    } catch {
      node.dataset.localeParams = '';
    }
  } else {
    delete node.dataset.localeParams;
  }
  node.textContent = translate(lang, key, params);
};

const setStatus = (ui, lang, key, params) => setText(ui?.statusEl, lang, key, params);
const setWarn = (ui, lang, key, params) => setText(ui?.warnEl, lang, key, params);

function clearWarnings(ui){
  const warnEl = ui?.warnEl;
  if (!warnEl) return;
  delete warnEl.dataset.localeKey;
  delete warnEl.dataset.localeParams;
  warnEl.textContent = '';
  warnEl.hidden = true;
  warnEl.removeAttribute?.('data-severity');
}

function createGuardrailState({ lang } = {}){
  return {
    lang: lang || 'en',
    warnings: [],
    errors: [],
    budget: {
      softExceeded: false,
      hardExceeded: false
    },
    blocked: false
  };
}

function noteGuardrail(state, { severity = 'warn', key = null, message = '', params = null } = {}){
  if (!state) return;
  const entry = { severity, key, message, params };
  state.warnings.push(entry);
  if (severity === 'error'){
    state.errors.push(entry);
    state.blocked = true;
  }
  if (key === 'warnings.softCap' || key === 'warnings.softCapShort'){
    state.budget.softExceeded = true;
  }
  if (key === 'warnings.sessionCap' || key === 'warnings.sessionCapHard'){
    state.budget.hardExceeded = true;
  }
}

function resolveGuardPayload(lang, payload, params){
  if (!payload){
    return { key: null, message: '', params: null };
  }
  if (typeof payload === 'string'){
    if (payload.startsWith('warnings.') || payload.startsWith('status.')){
      return { key: payload, message: translate(lang, payload, params), params: params || null };
    }
    return { key: null, message: payload, params: null };
  }
  if (typeof payload === 'object'){
    const key = payload.key || null;
    const mergedParams = payload.params ?? params ?? null;
    if (key){
      return { key, message: translate(lang, key, mergedParams), params: mergedParams };
    }
    const message = payload.message || '';
    return { key: null, message, params: mergedParams };
  }
  return { key: null, message: String(payload), params: null };
}

const Budget = {
  soft: 75000,
  hard: 100000,
  spent: 0,
  approxTokens(s){ return Math.ceil((s||'').length / 4); }, // ~4 chars/token heuristic
  canSpend(n){ return (this.spent + n) <= this.hard; },
  note(n){ this.spent += Math.max(0, n|0); }
};

function createGuardEmitter(ui, guardrails, { onGuardrailWarning, onGuardrailError } = {}){
  return {
    warn(message, options){
      pushWarning(guardrails, ui, message, 'warn', options);
      onGuardrailWarning?.(message || '', options);
    },
    error(message, options){
      const meta = { blocked: true, ...(options || {}) };
      pushWarning(guardrails, ui, message, 'error', meta);
      onGuardrailError?.(message || '', meta);
    },
    clear(){
      clearWarnings(ui, guardrails);
    }
  };
}

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
async function tryExtractive({ query, lang, ui, guardrails }){
  setStatus(ui, lang, 'status.thinkingLocal');
  const text = await L5Local.draft({ query, lang, bm25Min:0.6, coverageNeeded:2 });
  if (!text) return { ok:false };
  // stream locally (simulated) and budget
  setStatus(ui, lang, 'status.streamingLocal');
  const aiEl = ui.addMsg('assistant','');
  let i=0;
  const step = () => {
    if (i < text.length){
      const chunk = text[i++]; aiEl.textContent += chunk; ui.chatEl.scrollTop = ui.chatEl.scrollHeight;
      return setTimeout(step, 8);
    } else {
      const toks = Budget.approxTokens(text); Budget.note(toks);
      setStatus(ui, lang, 'status.readyTokens', { tokens: Budget.spent });
      if (ui?.focusAssistant) ui.focusAssistant(aiEl);
      return;
    }
  };
  step();
  return { ok:true, text };
}

// Try WebLLM on GPU (only if low confidence)
async function tryWebGPU({ query, lang, ui, modelId, guard, guardrails }){
  setStatus(ui, lang, 'status.loadingLocalModel');
  await WebLLM.load({
    model: modelId || 'Llama-3.1-8B-Instruct-q4f16_1',
    progress: (p)=>{
      const percent = Math.round((p?.progress||0)*100);
      setStatus(ui, lang, 'status.loadingLocalModelProgress', { percent });
    }
  });

  const strong = await deriveStrong({ query, lang });
  const sys = groundedSystem({ lang, strong });

  setStatus(ui, lang, 'status.streamingLocalGpu');
  const aiEl = ui.addMsg('assistant','');
  let tokensStreamed = 0;
  let budgetWarned = false;
  const out = await WebLLM.generate({
    prompt: query,
    system: sys,
    onToken: (tok)=>{
      const t = Budget.approxTokens(tok);
      if (!Budget.canSpend(t)){
        const projected = Budget.spent + t;
        const key = projected > Budget.hard ? 'warnings.sessionCapHard' : 'warnings.sessionCap';
        if (!guardrails.budget.hardExceeded){
          noteGuardrail(guardrails, { severity: 'error', key });
        }
        if (!budgetWarned){
          pushWarning(guardrails, ui, translate(lang, 'warnings.sessionCap'), 'error', { code: 'budget.hard', blocked: true });
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
  setStatus(ui, lang, 'status.readyTokens', { tokens: Budget.spent });
  return out;
}

// Server fallback (/api/chat) with budget guard
async function tryServer({ state, ui, guard }){
  const lang = state?.lang || 'en';
  setStatus(ui, lang, 'status.connecting');
  const res = await fetch('/api/chat', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','X-CSRF':state.csrf, 'X-Session-Tokens-Spent': String(Budget.spent) },
    body: JSON.stringify({ messages: state.messages.slice(-16), lang: state.lang, csrf: state.csrf, hp: state.hp||'' })
  });
  if (!res.ok || !res.body){ setStatus(ui, lang, 'status.serverError'); return ''; }

  setStatus(ui, lang, 'status.streaming');
  const reader=res.body.getReader(); const dec=new TextDecoder();
  const aiEl=ui.addMsg('assistant',''); let text='';
  let budgetWarned=false;
  while(true){
    const {value, done}=await reader.read(); if(done) break;
    const chunk=dec.decode(value,{stream:true});
    for (const line of chunk.split('\n')){
      if(!line.startsWith('data: ')) continue;
      const data=line.slice(6); if(data==='[END]') break;
      const trimmed = data.trim();
      if (trimmed.startsWith('{')){
        try {
          const payload = JSON.parse(trimmed);
          if (payload && typeof payload === 'object'){
            const guardLevel = (payload.level || payload.severity || (payload.error && 'error') || (payload.warning && 'warn') || (payload.guard && payload.guard.level) || '').toLowerCase();
            const guardMessage = payload.message || payload.text || payload.warning || payload.error || payload.reason || '';
            const guardType = (payload.type || payload.kind || payload.guard || payload.guardrail || '').toString().toLowerCase();
            if (guardLevel || guardMessage || guardType === 'guard'){
              const severity = (guardLevel || guardType) === 'error' ? 'error' : 'warn';
              noteGuardrail(guardrails, { severity, message: guardMessage });
              if (severity === 'error'){
                guard?.error?.(guardMessage);
              } else {
                guard?.warn?.(guardMessage);
              }
              continue;
            }
          }
        } catch {
          // fall through if JSON parse fails
        }
      }
      // budget guard on server stream too
      const approx = Budget.approxTokens(data);
      if (!Budget.canSpend(approx)) {
        guard?.warn?.(translate(lang, 'warnings.sessionCap'));
        continue;
      }
      text+=data; aiEl.textContent=text; ui.chatEl.scrollTop=ui.chatEl.scrollHeight;
      Budget.note(approx);
    }
  }
  setStatus(ui, lang, 'status.readyTokens', { tokens: Budget.spent });
  return text;
}

export async function routeChat({ ui, state, onGuardrailWarning, onGuardrailError } = {}){
  const guardrails = createGuardState();
  const guard = createGuardEmitter(ui, guardrails, { onGuardrailWarning, onGuardrailError });
  guard.clear?.();
  const mode = state.mode || 'hybrid'; // 'local' | 'hybrid' | 'external'
  const lastUser = state.messages.filter(m=>m.role==='user').slice(-1)[0];
  const query = lastUser?.content || '';

  // Hard budget check upfront
  if (!Budget.canSpend(1)){
    guard.warn(translate(lang, 'warnings.sessionCapHard'), { code: 'budget.hard', blocked: true });
    return;
  }

  clearWarnings(ui, guardrails);

  // 1) Local extractive always first
  const ex = await tryExtractive({ query, lang: state.lang, ui, guardrails });
  mergeGuardrails(guardrails, ex.guardrails);
  if (ex.ok){
    state.messages.push({role:'assistant', content: ex.text});
    if (Budget.spent >= Budget.soft && Budget.spent < Budget.hard){
      guard.warn(translate(lang, 'warnings.softCap'), { code: 'budget.soft' });
    }
    return { source:'extractive', guardrails };
  }

  // 2) Low confidence → try WebLLM/WebGPU if allowed by mode and GPU is available and budget permits
  if (mode !== 'external' && WebLLM.hasWebGPU() && Budget.canSpend(500)){ // need headroom
    try {
      const text = await tryWebGPU({ query, lang: state.lang, ui, modelId: state.webllmModel, guard, guardrails });
      if (text){
        state.messages.push({role:'assistant', content: text});
        if (Budget.spent >= Budget.soft && Budget.spent < Budget.hard){
          guard.warn(translate(lang, 'warnings.softCapShort'), { code: 'budget.soft' });
        }
        return { source:'webgpu', guardrails };
      }
    } catch (e){
      // ignore and drop to server path
      const message = (String(e?.message||e).includes('webgpu'))
        ? translate(lang, 'warnings.webgpuMissing')
        : translate(lang, 'warnings.localModelMissing');
      guard.warn(message);
    }
  }

  // 3) Server fallback if mode allows
  if (mode !== 'local'){
    if (!Budget.canSpend(1000)){ guard.warn(translate(lang, 'warnings.serverBudget')); return; }
    const text = await tryServer({ state, ui, guard });
    if (text) state.messages.push({role:'assistant', content: text});
    if (!guardrails.warnings.length) clearWarnings(ui, guardrails);
    return { source:'server', guardrails };
  }

  // 4) Local-only and nothing worked
  setStatus(ui, lang, 'status.noLocalAnswer');
  return { source:'none', guardrails };
}

