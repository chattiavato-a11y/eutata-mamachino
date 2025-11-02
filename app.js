'use strict';

(function(){
  const qs = (sel) => document.querySelector(sel);
  const chat = qs('#chat');
  const input = qs('#input');
  const sendBtn = qs('#send');
  const status = qs('#status');
  const warn = qs('#warn');
  const langSel = qs('#langSel');
  const themeBtn = qs('#themeBtn');
  const form = qs('#chatForm');
  const copyrightYear = qs('#copyrightYear');
  const footerCopy = qs('#footerCopy');
  const dialogTriggers = document.querySelectorAll('[data-dialog-target]');

  const themeKey = 'shield.theme';
  const langKey = 'shield.lang';

  const safeGet = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (err){
      console.warn('Storage get blocked', err);
      return null;
    }
  };

  const safeSet = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (err){
      console.warn('Storage set blocked', err);
    }
  };

  const prefersLight = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;

  const state = {
    messages: [],
    lang: safeGet(langKey) || 'en',
    theme: safeGet(themeKey) || (prefersLight ? 'light' : 'dark'),
    csrf: Shield.csrfToken(),
  };

  const usage = {
    tokens: { used: 0, limit: null },
    minutes: { used: null, limit: null },
  };

  function normalizeNumber(value){
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const cleaned = String(value).trim();
    if (!cleaned) return null;
    const match = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
    if (!match) return null;
    const numeric = Number(match[0]);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function renderUsage(){
    if (tokenMeter && tokenProgress && tokenValue){
      const used = usage.tokens.used ?? 0;
      const limit = usage.tokens.limit;
      const max = (limit && limit > 0) ? limit : Math.max(used, 1);
      tokenProgress.max = max;
      tokenProgress.value = Math.min(used, max);
      tokenValue.textContent = limit ? `${used} / ${limit}` : `${used}`;
      tokenMeter.classList.toggle('hidden', used === null);
    }

    if (minuteMeter && minuteProgress && minuteValue){
      const used = usage.minutes.used;
      if (used === null || used === undefined){
        minuteMeter.classList.add('hidden');
      } else {
        const limit = usage.minutes.limit;
        const max = (limit && limit > 0) ? limit : Math.max(used, 1);
        minuteProgress.max = max;
        minuteProgress.value = Math.min(used, max);
        minuteValue.textContent = limit ? `${used} / ${limit}` : `${used}`;
        minuteMeter.classList.remove('hidden');
      }
    }
  }

  function resetUsage(){
    usage.tokens.used = 0;
    usage.minutes.used = null;
    usage.minutes.limit = null;
    renderUsage();
  }

  function parseHeaderPayload(raw){
    if (!raw) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    let parsed = null;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))){
      try {
        const maybe = JSON.parse(trimmed);
        if (maybe && typeof maybe === 'object'){ parsed = maybe; }
      } catch (err){
        console.debug('Unable to parse JSON header payload', err);
      }
    }
    if (!parsed){
      parsed = {};
      const segments = trimmed.split(/[,;]/);
      for (const segment of segments){
        const part = segment.trim();
        if (!part) continue;
        const match = part.match(/^([^:=]+)[:=]\s*(.+)$/);
        if (!match) continue;
        const key = match[1].trim();
        const value = match[2].trim();
        if (key) parsed[key] = value;
      }
    }
    return parsed;
  }

  function applyUsageUpdate(payload){
    if (!payload || typeof payload !== 'object') return;
    let changed = false;
    for (const [key, value] of Object.entries(payload)){
      const lower = key.toLowerCase();
      const num = normalizeNumber(value);
      if (num === null) continue;
      if (lower.includes('token')){
        if (lower.includes('limit') || lower.includes('max') || lower.includes('cap') || lower.includes('total')){
          if (usage.tokens.limit !== num){ usage.tokens.limit = num; changed = true; }
        } else if (usage.tokens.used !== num){
          usage.tokens.used = num;
          changed = true;
        }
      }
      if (lower.includes('minute') || lower.includes('time')){
        if (lower.includes('limit') || lower.includes('max') || lower.includes('cap') || lower.includes('total')){
          if (usage.minutes.limit !== num){ usage.minutes.limit = num; changed = true; }
        } else if (usage.minutes.used !== num){
          usage.minutes.used = num;
          changed = true;
        }
      }
    }
    if (changed) renderUsage();
  }

  function handleSseComment(comment){
    const payload = parseHeaderPayload(comment);
    if (payload && Object.keys(payload).length){
      applyUsageUpdate(payload);
    }
  }

  function isHeaderEvent(name){
    if (!name) return false;
    const value = String(name).toLowerCase();
    return value === 'header' || value === 'usage' || value === 'meta';
  }

  function applyTheme(theme){
    const normalized = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = normalized;
    if (themeBtn){
      themeBtn.textContent = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      themeBtn.setAttribute('aria-pressed', normalized === 'dark' ? 'true' : 'false');
    }
    safeSet(themeKey, normalized);
    state.theme = normalized;
  }

  function applyLanguage(lang){
    const normalized = lang === 'es' ? 'es' : 'en';
    if (langSel){
      langSel.value = normalized;
    }
    safeSet(langKey, normalized);
    state.lang = normalized;
  }

  function addMessage(role, text){
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'me' : 'ai');
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  function clientCheck(text){
    const check = Shield.scanAndSanitize(text, {maxLen: 2000, threshold: 12});
    if (!check.ok){
      warn.textContent = `Blocked by client guardrails. Reasons: ${check.reasons.join(', ')}`;
      return {ok:false};
    }
    warn.textContent = '';
    return {ok:true, sanitized: check.sanitized};
  }

  async function sendMsg(evt){
    if (evt){
      evt.preventDefault();
    }
    const raw = (input.value || '').trim();
    if (!raw){
      return;
    }

    const firstPass = clientCheck(raw);
    if (!firstPass.ok){
      return;
    }

    const sanitized = firstPass.sanitized;
    addMessage('user', sanitized);
    state.messages.push({role: 'user', content: sanitized, lang: state.lang});
    input.value = '';

    const secondPass = clientCheck(sanitized);
    if (!secondPass.ok){
      return;
    }

    status.textContent = 'Connecting…';
    resetUsage();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF': state.csrf,
        },
        body: JSON.stringify({
          messages: state.messages.slice(-16),
          lang: state.lang,
          csrf: state.csrf,
          hp: (state.hpField && state.hpField.value) || '',
        }),
      });

      if (!res.ok || !res.body){
        status.textContent = 'Error starting stream.';
        return;
      }

      status.textContent = 'Streaming…';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const aiEl = addMessage('assistant', '');
      let aiText = '';
      let buffer = '';
      let currentEvent = 'message';
      let headerChunk = '';
      let streamClosed = false;

      while (!streamClosed){
        const {value, done} = await reader.read();
        if (done){
          if (isHeaderEvent(currentEvent) && headerChunk){
            const payload = parseHeaderPayload(headerChunk);
            applyUsageUpdate(payload);
          }
          break;
        }
        buffer += decoder.decode(value, {stream: true});
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1){
          const rawLine = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          const line = rawLine.replace(/\r$/, '');

          if (line === ''){
            if (isHeaderEvent(currentEvent) && headerChunk){
              const payload = parseHeaderPayload(headerChunk);
              applyUsageUpdate(payload);
              headerChunk = '';
            }
            currentEvent = 'message';
            continue;
          }

          if (line.startsWith('event:')){
            currentEvent = line.slice(6).trim().toLowerCase() || 'message';
            continue;
          }

          if (line.startsWith(':')){
            handleSseComment(line.slice(1));
            continue;
          }

          if (!line.startsWith('data:')){
            continue;
          }

          const data = line.slice(6);
          if (isHeaderEvent(currentEvent)){
            headerChunk += data;
            continue;
          }

          if (data === '[END]'){
            buffer = '';
            streamClosed = true;
            break;
          }
          aiText += data;
          aiEl.textContent = aiText;
          chat.scrollTop = chat.scrollHeight;
        }
      }

      status.textContent = 'Ready.';
      state.messages.push({role: 'assistant', content: aiText});
    } catch (err){
      console.error('Chat error', err);
      status.textContent = 'Network error.';
    }
  }

  function initHoneypot(){
    if (!form || !Shield.attachHoneypot){
      return;
    }
    state.hpField = Shield.attachHoneypot(form);
  }

  function initFooter(){
    const now = new Date();
    const year = String(now.getFullYear());
    if (copyrightYear){
      copyrightYear.textContent = year;
    }
    if (footerCopy){
      footerCopy.textContent = `© ${year} ShieldOps Consortium · Trademarks belong to their respective owners.`;
    }
  }

  function initPolicyDialogs(){
    dialogTriggers.forEach((trigger) => {
      const targetId = trigger.getAttribute('data-dialog-target');
      const dialog = targetId ? document.getElementById(targetId) : null;
      if (!dialog){
        return;
      }

      trigger.addEventListener('click', () => {
        if (typeof dialog.showModal === 'function'){
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      });

      dialog.addEventListener('click', (event) => {
        if (event.target === dialog && typeof dialog.close === 'function'){
          dialog.close('backdrop');
        }
      });
    });

    document.querySelectorAll('[data-dialog-close]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const dialog = btn.closest('dialog');
        if (dialog && typeof dialog.close === 'function'){
          event.preventDefault();
          dialog.close('button');
        }
      });
    });
  }

  function init(){
    applyTheme(state.theme);
    applyLanguage(state.lang);
    initHoneypot();
    initFooter();
    initPolicyDialogs();

    if (!form || !input || !sendBtn || !chat){
      console.error('Critical UI elements missing; aborting init.');
      return;
    }

    form.addEventListener('submit', sendMsg);
    sendBtn.addEventListener('click', sendMsg);

    if (themeBtn){
      themeBtn.addEventListener('click', () => {
        applyTheme(state.theme === 'dark' ? 'light' : 'dark');
      });
    }

    if (langSel){
      langSel.addEventListener('change', (event) => {
        applyLanguage(event.target.value);
      });
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey){
        event.preventDefault();
        sendMsg();
      }
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
