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
  const cookieBanner = qs('#cookieBanner');
  const acceptCookies = qs('#acceptCookies');
  const declineCookies = qs('#declineCookies');
  const copyrightYear = qs('#copyrightYear');
  const modeSel = qs('#modeSel');
  const budgetHint = qs('#budgetHint');

  const STRINGS = {
    en: {
      composer: {
        placeholder: 'Type a message…',
        send: 'Send',
        micIdle: 'Start voice input',
        micListening: 'Stop voice input',
        micUnavailable: 'Voice input unavailable',
        status: {
          idle: 'Ready.',
          listening: 'Listening…',
          partial: 'Heard: {{text}}',
          permission: 'Microphone permission is required.',
          unsupported: 'Voice capture unavailable.',
          error: 'Microphone error.',
        },
        blocked: 'Blocked input.',
        blockedReasons: 'Blocked input. Reasons: {{reasons}}',
      },
    },
    es: {
      composer: {
        placeholder: 'Escribe un mensaje…',
        send: 'Enviar',
        micIdle: 'Iniciar entrada de voz',
        micListening: 'Detener entrada de voz',
        micUnavailable: 'Entrada de voz no disponible',
        status: {
          idle: 'Listo.',
          listening: 'Escuchando…',
          partial: 'Oído: {{text}}',
          permission: 'Se requiere permiso del micrófono.',
          unsupported: 'Captura de voz no disponible.',
          error: 'Error del micrófono.',
        },
        blocked: 'Entrada bloqueada.',
        blockedReasons: 'Entrada bloqueada. Motivos: {{reasons}}',
      },
    },
  };

  const consentKey = 'shield.cookies';
  const themeKey = 'shield.theme';
  const langKey = 'shield.lang';

  const safeGet = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      console.warn('Storage get blocked', err);
      return null;
    }
  };

  const safeSet = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      console.warn('Storage set blocked', err);
    }
  };

  const prefersLight = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;

  const state = {
    messages: [],
    lang: safeGet(langKey) || 'en',
    theme: safeGet(themeKey) || (prefersLight ? 'light' : 'dark'),
    csrf: window.Shield?.csrfToken ? window.Shield.csrfToken() : '',
    analytics: safeGet(consentKey) === 'all',
    mode: (modeSel && modeSel.value) || 'hybrid',
    webllmModel: 'Llama-3.1-8B-Instruct-q4f16_1',
  };

  const format = (template, params = {}) => {
    if (typeof template !== 'string') {
      return '';
    }
    return template.replace(/{{(\w+)}}/g, (_, key) => (params[key] != null ? String(params[key]) : ''));
  };

  const getStrings = () => STRINGS[state.lang] || STRINGS.en;

  let voiceOwnsStatus = true;
  let voiceStatus = 'idle';
  let audioModulePromise = null;
  let audioModule = null;
  let stopListening = null;
  let isRecording = false;
  let isLoadingAudio = false;

  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const micUnavailable = () => (!speechSupported) || (audioModule && !audioModule.hasSTT);

  const setWarning = (message = '', severity = 'warn') => {
    if (!warnEl) {
      return;
    }
    warnEl.textContent = message || '';
    warnEl.hidden = !message;
    if (message) {
      warnEl.dataset.severity = severity;
    } else {
      warnEl.removeAttribute('data-severity');
    }
  };

  const setVoiceStatus = (key = 'idle', ctx) => {
    if (!statusEl) {
      return;
    }
    voiceOwnsStatus = true;
    voiceStatus = key;
    const strings = getStrings().composer.status;
    const template = strings[key] || strings.idle;
    statusEl.textContent = format(template, ctx);
    statusEl.dataset.status = key;
  };

  const releaseVoiceStatus = () => {
    voiceOwnsStatus = false;
  };

  const updateMicLabel = (isActive, unavailable = micUnavailable()) => {
    if (!micBtn) {
      return;
    }
    const strings = getStrings().composer;
    let label = strings.micIdle;
    if (unavailable) {
      label = strings.micUnavailable;
    } else if (isActive) {
      label = strings.micListening;
    }
    micBtn.setAttribute('aria-label', label);
    const hidden = micBtn.querySelector('.visually-hidden');
    if (hidden) {
      hidden.textContent = label;
    }
  };

  const updateMicVisual = (isActive) => {
    if (!micBtn) {
      return;
    }
    micBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  };

  const updateComposerCopy = () => {
    const strings = getStrings().composer;
    if (input) {
      input.placeholder = strings.placeholder;
    }
    if (sendBtn) {
      sendBtn.textContent = strings.send;
    }
    if (micBtn) {
      updateMicLabel(isRecording);
    }
    if (voiceOwnsStatus) {
      if (voiceStatus === 'partial') {
        setVoiceStatus('partial', { text: input ? input.value : '' });
      } else {
        setVoiceStatus(voiceStatus || 'idle');
      }
    }
  };

  const applyTheme = (theme) => {
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

  const ensureAudioModule = async () => {
    if (!speechSupported) {
      return null;
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

    state.hp = state.hpField ? state.hpField.value || '' : '';
    releaseVoiceStatus();
    try {
      await routeChat({
        state,
        ui: { chatEl: chat, warnEl, statusEl, addMsg },
        onGuardrailWarning: (message) => handleGuard(message, 'warn'),
        onGuardrailError: (message) => handleGuard(message, 'error'),
      });
    } catch (err) {
      console.error('Chat routing error', err);
      setWarning('Chat routing failed.', 'error');
    }
  };

  const initCookieBanner = () => {
    if (!cookieBanner || !acceptCookies || !declineCookies) {
      return;
    }
    const stored = safeGet(consentKey);
    if (!stored) {
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
  };

  const initHoneypot = () => {
    if (!form || !window.Shield?.attachHoneypot) {
      return;
    }
    state.hpField = window.Shield.attachHoneypot(form);
  };

  const initFooter = () => {
    if (!copyrightYear) {
      return;
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

  const init = () => {
    if (!ensureChatReady()) {
      return;
    }
    setWarning('');
    setVoiceStatus('idle');
    applyTheme(state.theme);
    applyLanguage(state.lang);
    initCookieBanner();
    initHoneypot();
    initFooter();
    initBudgetHint();
    initMic();

    form.addEventListener('submit', sendMsg);
    sendBtn.addEventListener('click', sendMsg);

    themeBtn?.addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    langSel?.addEventListener('change', (event) => {
      if (isRecording) {
        stopRecording();
      }
      applyLanguage(event.target.value);
    });

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
