// L6: Orchestrator — tries L5Local first; if null, falls back to server (/api/chat).
// Streams locally (simulated) or relays SSE from server.

import { L5Local } from './l5_local_llm.js';

export async function routeChat({ ui, state }){
  const { chatEl, warnEl, statusEl, addMsg } = ui;

  // 1) Local attempt (L5, no vendor)
  statusEl.textContent = 'Thinking locally…';
  const lastUser = state.messages.filter(m=>m.role==='user').slice(-1)[0];
  const bm25Min = 0.6, coverageNeeded = 2;
  let local = null; try {
    local = await L5Local.draft({ query: lastUser?.content||'', lang: state.lang, bm25Min, coverageNeeded });
  } catch (e){ /* pack missing etc. -> skip to server */ }

  if (local){
    // Simulate token stream
    statusEl.textContent = 'Streaming (local)…';
    const aiEl = addMsg('assistant',''); let i=0;
    const timer = setInterval(()=>{
      aiEl.textContent += local[i++] || '';
      chatEl.scrollTop = chatEl.scrollHeight;
      if (i>=local.length){ clearInterval(timer); statusEl.textContent='Ready.'; }
    }, 8);
    state.messages.push({role:'assistant', content: local});
    return;
  }

  // 2) Server fallback (your L2+L3+L7 Worker)
  statusEl.textContent='Connecting…';
  const res = await fetch('/api/chat', {
    method:'POST',
    headers:{'Content-Type':'application/json','X-CSRF':state.csrf},
    body: JSON.stringify({
      messages: state.messages.slice(-16),
      lang: state.lang,
      csrf: state.csrf,
      hp: state.hp || ''
    })
  });
  if (!res.ok || !res.body){ statusEl.textContent='Server error.'; return; }

  statusEl.textContent='Streaming…';
  const reader = res.body.getReader(); const dec = new TextDecoder();
  const aiEl = addMsg('assistant',''); let text='';
  while(true){
    const {value, done} = await reader.read(); if (done) break;
    const chunk = dec.decode(value, {stream:true});
    for (const line of chunk.split('\n')){
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[END]') break;
      text += data; aiEl.textContent = text; chatEl.scrollTop = chatEl.scrollHeight;
    }
  }
  statusEl.textContent='Ready.';
  state.messages.push({role:'assistant', content: text});
}
