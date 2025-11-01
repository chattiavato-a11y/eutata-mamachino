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
  const cookieBanner = qs('#cookieBanner');
  const acceptCookies = qs('#acceptCookies');
  const declineCookies = qs('#declineCookies');
  const copyrightYear = qs('#copyrightYear');

  const consentKey = 'shield.cookies';
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
    analytics: safeGet(consentKey) === 'all',
  };

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
      warn.textContent = `Blocked by client Shield. Reasons: ${check.reasons.join(', ')}`;
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
          analytics: state.analytics,
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

      while (true){
        const {value, done} = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, {stream: true});
        const lines = chunk.split('\n');
        for (const line of lines){
          if (!line.startsWith('data: ')){
            continue;
          }
          const data = line.slice(6);
          if (data === '[END]'){
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

  function initCookieBanner(){
    if (!cookieBanner || !acceptCookies || !declineCookies){
      return;
    }
    const stored = safeGet(consentKey);
    if (!stored){
      cookieBanner.classList.remove('hidden');
    }

    acceptCookies.addEventListener('click', () => {
      safeSet(consentKey, 'all');
      state.analytics = true;
      cookieBanner.classList.add('hidden');
    });

    declineCookies.addEventListener('click', () => {
      safeSet(consentKey, 'essential');
      state.analytics = false;
      cookieBanner.classList.add('hidden');
    });
  }

  function initHoneypot(){
    if (!form || !Shield.attachHoneypot){
      return;
    }
    state.hpField = Shield.attachHoneypot(form);
  }

  function initFooter(){
    if (copyrightYear){
      const now = new Date();
      copyrightYear.textContent = String(now.getFullYear());
    }
  }

  function init(){
    applyTheme(state.theme);
    applyLanguage(state.lang);
    initCookieBanner();
    initHoneypot();
    initFooter();

    if (!form || !input || !sendBtn || !chat){
      console.error('Critical UI elements missing; aborting init.');
      return;
    }

    form.addEventListener('submit', sendMsg);
    sendBtn.addEventListener('click', sendMsg);

    themeBtn.addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    langSel.addEventListener('change', (event) => {
      applyLanguage(event.target.value);
    });

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
