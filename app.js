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
  const headerTitle = qs('[data-i18n="headerTitle"]');
  const themeLabel = qs('[data-i18n="themeLabel"]');
  const langLabel = qs('[data-i18n="langLabel"]');
  const messageLabel = qs('[data-i18n="messageLabel"]');
  const langOptionEn = langSel ? langSel.querySelector('option[value="en"]') : null;
  const langOptionEs = langSel ? langSel.querySelector('option[value="es"]') : null;

  const consentKey = 'shield.cookies';
  const themeKey = 'shield.theme';
  const langKey = 'shield.lang';

  const safeGet = (key, storage = window.localStorage) => {
    try {
      return storage.getItem(key);
    } catch (err){
      console.warn('Storage get blocked', err);
      return null;
    }
  };

  const safeSet = (key, value, storage = window.localStorage) => {
    try {
      storage.setItem(key, value);
    } catch (err){
      console.warn('Storage set blocked', err);
    }
  };

  const detectPreferredTheme = () => {
    const stored = safeGet(themeKey, window.sessionStorage);
    if (stored === 'light' || stored === 'dark'){
      return stored;
    }
    if (typeof window.matchMedia === 'function'){
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  };

  const detectPreferredLanguage = () => {
    const stored = safeGet(langKey, window.sessionStorage);
    return stored === 'es' ? 'es' : 'en';
  };

  const translations = {
    en: {
      headerTitle: 'OPS Chat Interface',
      themeLabel: 'Theme',
      themeButtonLight: 'Light',
      themeButtonDark: 'Dark',
      themeToggleToLight: 'Switch to light theme',
      themeToggleToDark: 'Switch to dark theme',
      langLabel: 'Language',
      languageOptionEn: 'English',
      languageOptionEs: 'Spanish',
      send: 'Send',
      messageLabel: 'Chat message',
      messagePlaceholder: 'Type a message…',
      statusReady: 'Ready.',
      statusConnecting: 'Connecting…',
      statusStreaming: 'Streaming…',
      statusStartError: 'Error starting stream.',
      statusNetworkError: 'Network error.',
      warnBlocked: (reasons) => `Blocked by client Shield. Reasons: ${reasons.join(', ')}`,
    },
    es: {
      headerTitle: 'Interfaz de chat OPS',
      themeLabel: 'Tema',
      themeButtonLight: 'Claro',
      themeButtonDark: 'Oscuro',
      themeToggleToLight: 'Cambiar a tema claro',
      themeToggleToDark: 'Cambiar a tema oscuro',
      langLabel: 'Idioma',
      languageOptionEn: 'Inglés',
      languageOptionEs: 'Español',
      send: 'Enviar',
      messageLabel: 'Mensaje del chat',
      messagePlaceholder: 'Escribe un mensaje…',
      statusReady: 'Listo.',
      statusConnecting: 'Conectando…',
      statusStreaming: 'Transmitiendo…',
      statusStartError: 'Error al iniciar la transmisión.',
      statusNetworkError: 'Error de red.',
      warnBlocked: (reasons) => `Bloqueado por Shield del cliente. Motivos: ${reasons.join(', ')}`,
    },
  };

  const getStrings = () => translations[state.lang] || translations.en;

  const state = {
    messages: [],
    lang: 'en',
    theme: 'dark',
    csrf: Shield.csrfToken(),
    analytics: safeGet(consentKey) === 'all',
    statusKey: 'statusReady',
    warnKey: null,
    warnData: null,
  };

  state.lang = detectPreferredLanguage();
  state.theme = detectPreferredTheme();

  document.documentElement.dataset.theme = state.theme;
  document.documentElement.lang = state.lang;

  function updateThemeButton(strings){
    if (!themeBtn){
      return;
    }
    const isDark = state.theme === 'dark';
    const labelKey = isDark ? 'themeButtonDark' : 'themeButtonLight';
    const toggleLabel = isDark ? strings.themeToggleToLight : strings.themeToggleToDark;
    themeBtn.textContent = strings[labelKey];
    themeBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    themeBtn.setAttribute('aria-label', toggleLabel);
    themeBtn.setAttribute('title', toggleLabel);
  }

  function setStatus(key){
    state.statusKey = key;
    if (status){
      const strings = getStrings();
      status.textContent = strings[key] || '';
    }
  }

  function setWarnBlocked(reasons){
    state.warnKey = 'warnBlocked';
    state.warnData = {reasons};
    if (warn){
      warn.textContent = getStrings().warnBlocked(reasons);
    }
  }

  function clearWarn(){
    state.warnKey = null;
    state.warnData = null;
    if (warn){
      warn.textContent = '';
    }
  }

  function updateUIStrings(){
    const strings = getStrings();
    if (headerTitle){
      headerTitle.textContent = strings.headerTitle;
    }
    if (themeLabel){
      themeLabel.textContent = strings.themeLabel;
    }
    if (langLabel){
      langLabel.textContent = strings.langLabel;
    }
    if (langSel){
      langSel.value = state.lang;
      langSel.setAttribute('aria-label', strings.langLabel);
      langSel.setAttribute('title', strings.langLabel);
    }
    if (langOptionEn){
      langOptionEn.textContent = strings.languageOptionEn;
    }
    if (langOptionEs){
      langOptionEs.textContent = strings.languageOptionEs;
    }
    if (messageLabel){
      messageLabel.textContent = strings.messageLabel;
    }
    if (input){
      input.placeholder = strings.messagePlaceholder;
      input.setAttribute('aria-label', strings.messageLabel);
    }
    if (sendBtn){
      sendBtn.textContent = strings.send;
    }
    updateThemeButton(strings);
    if (status){
      const statusText = strings[state.statusKey] || '';
      status.textContent = statusText;
    }
    if (warn){
      if (state.warnKey === 'warnBlocked' && state.warnData){
        warn.textContent = strings.warnBlocked(state.warnData.reasons);
      } else if (!state.warnKey){
        warn.textContent = '';
      }
    }
  }

  function applyTheme(theme){
    const normalized = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = normalized;
    state.theme = normalized;
    updateThemeButton(getStrings());
    safeSet(themeKey, normalized, window.sessionStorage);
  }

  function applyLanguage(lang){
    const normalized = lang === 'es' ? 'es' : 'en';
    if (langSel){
      langSel.value = normalized;
    }
    safeSet(langKey, normalized, window.sessionStorage);
    state.lang = normalized;
    document.documentElement.lang = normalized;
    updateUIStrings();
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
      setWarnBlocked(check.reasons);
      return {ok:false};
    }
    clearWarn();
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

    setStatus('statusConnecting');
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
        setStatus('statusStartError');
        return;
      }

      setStatus('statusStreaming');
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

      setStatus('statusReady');
      state.messages.push({role: 'assistant', content: aiText});
    } catch (err){
      console.error('Chat error', err);
      setStatus('statusNetworkError');
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
