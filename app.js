import { routeChat } from './packs/l6_orchestrator.js';

(() => {
  const qs = (selector, root = document) => root.querySelector(selector);

  const chat = qs('#chat');
  const input = qs('#input');
  const sendBtn = qs('#send');
  const statusEl = qs('#status');
  const warnEl = qs('#warn');
  const micBtn = qs('#micBtn');
  const langSel = qs('#langSel');
  const themeBtn = qs('#themeBtn');
  const form = qs('#chatForm');
  const copyrightYear = qs('#copyrightYear');
  const footerCopy = qs('#footerCopy');
  const dialogTriggers = document.querySelectorAll('[data-dialog-target]');

  const themeKey = 'shield.theme';
  const langKey = 'shield.lang';

  const safeGet = (key, storage = window.localStorage) => {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      console.warn('Storage get blocked', err);
      return null;
    }
  };

  const safeSet = (key, value, storage = window.localStorage) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
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
      statusReady: '',
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
    if (themeBtn) {
      themeBtn.textContent = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      themeBtn.setAttribute('aria-pressed', normalized === 'dark' ? 'true' : 'false');
    }
    safeSet(themeKey, normalized);
    state.theme = normalized;
  };

  const applyLanguage = (lang) => {
    const normalized = lang === 'es' ? 'es' : 'en';
    state.lang = normalized;
    if (langSel) {
      langSel.value = normalized;
    }
    safeSet(langKey, normalized);
    updateComposerCopy();
  };

  const addMessage = (role, text) => {
    if (!chat) {
      return null;
    }
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'me' : 'ai');
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  };

  function clientCheck(text){
    const check = Shield.scanAndSanitize(text, {maxLen: 2000, threshold: 12});
    if (!check.ok){
      warn.textContent = `Blocked by client guardrails. Reasons: ${check.reasons.join(', ')}`;
      return {ok:false};
    }
    if (!audioModulePromise) {
      audioModulePromise = import('./packs/l4_audio.js')
        .then((mod) => {
          audioModule = mod.L4Audio;
          if (micBtn) {
            micBtn.disabled = micUnavailable();
            if (!audioModule.hasSTT) {
              updateMicLabel(false);
              setVoiceStatus('unsupported');
            }
          }
          return audioModule;
        })
        .catch((err) => {
          console.error('Failed to load audio module', err);
          if (micBtn) {
            micBtn.disabled = true;
          }
          setVoiceStatus('error');
          return null;
        });
    }
    return audioModulePromise;
  };

  const startRecording = async () => {
    if (!micBtn || isRecording || isLoadingAudio) {
      return;
    }
    isLoadingAudio = true;
    micBtn.disabled = true;
    try {
      const audio = await ensureAudioModule();
      if (!audio || !audio.hasSTT) {
        return;
      }
      micBtn.disabled = micUnavailable();
      isRecording = true;
      updateMicVisual(true);
      updateMicLabel(true);
      setVoiceStatus('listening');
      stopListening = audio.listen({
        lang: state.lang,
        onResult: (text, isFinal) => {
          const sanitizer = window.Shield?.baseSanitize;
          const safeText = typeof sanitizer === 'function' ? sanitizer(text, 512) : (text || '');
          if (typeof safeText === 'string') {
            if (input) {
              input.value = safeText;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.focus();
              const len = safeText.length;
              if (typeof input.setSelectionRange === 'function') {
                input.setSelectionRange(len, len);
              }
            }
            if (!isFinal && safeText.trim()) {
              setVoiceStatus('partial', { text: safeText });
            }
            if (isFinal) {
              setVoiceStatus('idle');
            }
          }
        },
        onEnd: () => {
          isRecording = false;
          stopListening = null;
          updateMicVisual(false);
          updateMicLabel(false);
          if (voiceOwnsStatus) {
            setVoiceStatus('idle');
          }
        },
      });
    } catch (err) {
      console.error('Failed to start recording', err);
      setVoiceStatus('error');
    } finally {
      micBtn.disabled = micUnavailable();
      updateMicLabel(isRecording);
      isLoadingAudio = false;
    }
  };

  const stopRecording = ({ updateStatus = true } = {}) => {
    if (stopListening) {
      try {
        stopListening();
      } catch (err) {
        console.warn('Error stopping recorder', err);
      }
      stopListening = null;
    }
    isRecording = false;
    updateMicVisual(false);
    micBtn.disabled = micUnavailable();
    updateMicLabel(false);
    if (updateStatus) {
      setVoiceStatus('idle');
    }
  };

  const handleMicToggle = () => {
    if (!micBtn) {
      return;
    }
    if (isRecording) {
      stopRecording();
      return;
    }
    startRecording();
  };

  const clientCheck = (text) => {
    if (!text) {
      return { ok: false, sanitized: '' };
    }
    const scan = window.Shield?.scanAndSanitize
      ? window.Shield.scanAndSanitize(text, { maxLen: 2000, threshold: 12 })
      : { ok: true, sanitized: text };
    if (!scan.ok) {
      const strings = getStrings().composer;
      const message = scan.reasons && scan.reasons.length
        ? format(strings.blockedReasons, { reasons: scan.reasons.join(', ') })
        : strings.blocked;
      setWarning(message, 'error');
      return { ok: false, sanitized: '' };
    }
    return { ok: true, sanitized: scan.sanitized };
  };

  const ensureChatReady = () => {
    if (!form || !input || !sendBtn || !chat) {
      console.error('Critical UI elements missing; aborting init.');
      return false;
    }
    return true;
  };

  const handleGuard = (message, severity) => {
    setWarning(message, severity);
  };

  const sendMsg = async (evt) => {
    if (evt) {
      evt.preventDefault();
    }
    if (!ensureChatReady()) {
      return;
    }
    if (isRecording) {
      stopRecording({ updateStatus: false });
    }
    const raw = (input.value || '').trim();
    if (!raw) {
      return;
    }

    const firstPass = clientCheck(raw);
    if (!firstPass.ok) {
      return;
    }

    setWarning('');
    addMessage('user', firstPass.sanitized);
    state.messages.push({ role: 'user', content: firstPass.sanitized, lang: state.lang });
    input.value = '';

    const secondPass = clientCheck(firstPass.sanitized);
    if (!secondPass.ok) {
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
        setStatus('statusStartError');
        return;
      }

      setStatus('statusStreaming');
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

      setStatus('statusReady');
      state.messages.push({role: 'assistant', content: aiText});
    } catch (err){
      console.error('Chat error', err);
      setStatus('statusNetworkError');
    }
  };

  function initHoneypot(){
    if (!form || !Shield.attachHoneypot){
      return;
    }
    state.hpField = window.Shield.attachHoneypot(form);
  };

  function initFooter(){
    const now = new Date();
    const year = String(now.getFullYear());
    if (copyrightYear){
      copyrightYear.textContent = year;
    }
    if (footerCopy){
      footerCopy.textContent = `© ${year} ShieldOps Consortium · Trademarks belong to their respective owners.`;
    }
    const now = new Date();
    copyrightYear.textContent = String(now.getFullYear());
  };

  const initBudgetHint = () => {
    if (!budgetHint) {
      return;
    }
    setInterval(() => {
      const text = Array.from(document.querySelectorAll('.msg.ai'))
        .map((node) => node.textContent || '')
        .join('');
      budgetHint.textContent = String(Math.ceil(text.length / 4));
    }, 800);
  };

  const initMic = () => {
    if (!micBtn) {
      return;
    }
    micBtn.disabled = micUnavailable();
    updateMicLabel(false);
    if (!speechSupported) {
      setVoiceStatus('unsupported');
      return;
    }
    micBtn.addEventListener('click', handleMicToggle);
    const warm = () => {
      ensureAudioModule().catch(() => {});
    };
    micBtn.addEventListener('pointerenter', warm, { once: true });
    micBtn.addEventListener('focus', warm, { once: true });
  };

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

    modeSel?.addEventListener('change', (event) => {
      state.mode = event.target.value;
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMsg();
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
