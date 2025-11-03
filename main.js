import { routeChat } from './packs/l6_orchestrator.js';

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => Array.from(document.querySelectorAll(selector));

const chat = qs('#chat');
const input = qs('#input');
const sendBtn = qs('#send');
const statusEl = qs('#status');
const warnEl = qs('#warn');
const form = qs('#chatForm');
const modeSelectors = qsa('[data-action="select-mode"]');
const langSelectors = qsa('[data-action="select-language"], [data-action="set-language"], [data-action="toggle-language"]');
const themeButtons = qsa('[data-action="toggle-theme"], [data-action="set-theme"]');
const micBtn = qs('#micBtn');
const voiceStatus = qs('#voiceStatus');
const micLabel = micBtn ? micBtn.querySelector('[data-role="mic-label"]') : null;
const budgetHint = qs('#budgetHint');
const cookieBanner = qs('#cookieBanner');
const acceptCookies = qs('#acceptCookies');
const declineCookies = qs('#declineCookies');
const dialogTriggers = qsa('[data-dialog-target]');
const dialogCloseButtons = qsa('[data-dialog-close]');
const footerCopy = qs('#footerCopy');
const rightsPrimary = qs('#rightsPrimary');

const consentKey = 'shield.cookies';
const themeKey = 'shield.theme';
const langKey = 'shield.lang';
const modeKey = 'shield.mode';

const prefersLight = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;

function safeGet(key){
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value){
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

const state = {
  messages: [],
  lang: safeGet(langKey) || 'es',
  theme: safeGet(themeKey) || (prefersLight ? 'light' : 'dark'),
  mode: safeGet(modeKey) || 'hybrid',
  csrf: window.Shield.csrfToken(),
  hp: '',
  analytics: safeGet(consentKey) === 'all',
  webllmModel: 'Llama-3.1-8B-Instruct-q4f16_1',
  wiringLog: []
};

const honeypotField = form && window.Shield.attachHoneypot ? window.Shield.attachHoneypot(form) : null;

let audioModulePromise = null;
let audioModule = null;
let stopListening = null;
let isRecording = false;
let lastSpokenText = '';
const voicePreviewLimit = 80;

function updateSendAvailability(){
  if (!sendBtn || !input){
    return;
  }
  const trimmed = (input.value || '').trim();
  const canSend = Boolean(trimmed);
  sendBtn.disabled = !canSend;
  if (form){
    form.classList.toggle('can-send', canSend);
  }
  input.dataset.hasValue = canSend ? 'true' : 'false';
}

function handleInputKeydown(event){
  if (event.key === 'Enter' && !event.shiftKey){
    event.preventDefault();
    if (!sendBtn?.disabled){
      sendMessage();
    }
  }
}

function handleInputChange(){
  updateSendAvailability();
}

function handleThemeToggle(event){
  event?.preventDefault?.();
  const requestedTheme = event?.currentTarget?.dataset?.theme || event?.target?.dataset?.theme;
  if (requestedTheme){
    applyTheme(requestedTheme);
    return;
  }
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function handleLanguageChange(event){
  const value = event?.target?.value;
  if (value){
    applyLanguage(value);
  }
}

function handleLanguageActivate(event){
  event?.preventDefault?.();
  const value = event?.currentTarget?.dataset?.lang || event?.target?.dataset?.lang;
  if (value){
    applyLanguage(value);
  }
}

function handleLanguageToggle(event){
  event?.preventDefault?.();
  const nextLang = event?.currentTarget?.dataset?.nextLang;
  if (nextLang){
    applyLanguage(nextLang);
    return;
  }
  applyLanguage(state.lang === 'es' ? 'en' : 'es');
}

function handleModeChange(event){
  const value = event?.target?.value;
  if (value){
    applyMode(value);
  }
}

function recordWiring(registry){
  if (!Array.isArray(registry)){
    return;
  }
  state.wiringLog = registry;
  if (typeof window !== 'undefined' && typeof window.console === 'object'){
    console.debug('[Cableado Shield]', registry);
  }
}

function wireConfigurations(configs){
  const handlerMap = {
    sendMessage,
    handleInputKeydown,
    handleInputChange,
    handleThemeToggle,
    handleLanguageChange,
    handleLanguageActivate,
    handleLanguageToggle,
    handleModeChange
  };
  const registry = [];

  configs.forEach((config) => {
    if (!config) return;
    const selector = config.link;
    const isNodeCollection = typeof NodeList !== 'undefined' && selector instanceof NodeList;
    const elements = typeof selector === 'string'
      ? Array.from(document.querySelectorAll(selector))
      : Array.isArray(selector) || isNodeCollection
        ? Array.from(selector).filter(Boolean)
        : selector
          ? [selector]
          : [];
    if (!elements.length) return;
    const handler = handlerMap[config.function];
    if (typeof handler !== 'function') return;

    elements.forEach((element) => {
      element.addEventListener(config.trigger, handler);
      const linkDescriptor = selector || (element.id ? `#${element.id}` : element.tagName.toLowerCase());
      registry.push({
        reference: config.reference,
        link: linkDescriptor,
        trigger: config.trigger,
        action: config.action,
        function: handler.name || config.function || 'anonymous'
      });
    });
  });

  recordWiring(registry);
  return registry;
}

function translate(key, params){
  if (window.I18N && typeof window.I18N.t === 'function'){
    return window.I18N.t(state.lang, key, params);
  }
  return key;
}

function setLocalizedText(node, key, params, { html = false } = {}){
  if (!node) return;
  if (!key){
    delete node.dataset.localeKey;
    delete node.dataset.localeParams;
    delete node.dataset.localeHtml;
    node.textContent = '';
    if (node === warnEl){
      node.hidden = true;
    }
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
  node.textContent = translate(key, params);
  if (node === warnEl){
    node.hidden = !node.textContent;
  }
}

function refreshDynamicLocale(){
  const nodes = document.querySelectorAll('[data-locale-key]');
  nodes.forEach((node) => {
    const key = node.dataset.localeKey;
    if (!key) return;
    let params;
    if (node.dataset.localeParams){
      try {
        params = JSON.parse(node.dataset.localeParams);
      } catch {
        params = undefined;
      }
    }
    const useHtml = node.dataset.localeHtml === 'true';
    const text = translate(key, params);
    if (useHtml){
      node.innerHTML = text;
    } else {
      node.textContent = text;
    }
    if (node === warnEl){
      const content = useHtml ? node.innerHTML : node.textContent;
      node.hidden = !content;
    }
  });
  updateMicButton();
}

function micSupported(){
  return Boolean(audioModule && audioModule.hasSTT);
}

function ttsSupported(){
  return Boolean(audioModule && audioModule.hasTTS);
}

function getIdleVoiceKey(){
  if (micSupported()) return 'voice.status.idle';
  if (ttsSupported()) return 'voice.status.playback';
  return 'voice.status.unsupported';
}

function setVoiceStatus(key, params){
  if (!voiceStatus) return;
  if (!key){
    voiceStatus.hidden = true;
    setLocalizedText(voiceStatus, '');
    return;
  }
  voiceStatus.hidden = false;
  setLocalizedText(voiceStatus, key, params);
}

function updateMicButton(){
  if (!micBtn) return;
  const labelKey = isRecording ? 'controls.micStop' : 'controls.micStart';
  const labelText = translate(labelKey);
  micBtn.setAttribute('aria-label', labelText);
  micBtn.setAttribute('title', labelText);
  micBtn.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
  if (isRecording){
    micBtn.disabled = false;
  } else {
    micBtn.disabled = !micSupported();
  }
  if (micLabel){
    setLocalizedText(micLabel, labelKey);
  }
}

function sanitizeVoiceText(text, limit = 512){
  const sanitizer = window.Shield && typeof window.Shield.baseSanitize === 'function'
    ? window.Shield.baseSanitize
    : null;
  const cleaned = sanitizer ? sanitizer(text, limit) : String(text || '').trim();
  return typeof cleaned === 'string' ? cleaned.trim() : '';
}

function previewVoiceText(text){
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.length <= voicePreviewLimit) return trimmed;
  return `${trimmed.slice(0, voicePreviewLimit)}…`;
}

function ensureAudioModule(){
  if (audioModule) return Promise.resolve(audioModule);
  if (!audioModulePromise){
    audioModulePromise = import('./packs/l4_audio.js')
      .then((mod) => {
        audioModule = mod?.L4Audio || null;
        updateMicButton();
        return audioModule;
      })
      .catch((err) => {
        console.error('No se pudo cargar el módulo de audio', err);
        audioModule = null;
        updateMicButton();
        return null;
      });
  }
  return audioModulePromise;
}

async function startRecording(){
  if (!micBtn || isRecording) return;
  const audio = await ensureAudioModule();
  if (!audio){
    setVoiceStatus('voice.status.error');
    return;
  }
  if (!audio.hasSTT){
    setVoiceStatus(getIdleVoiceKey());
    updateMicButton();
    return;
  }

  if (window.speechSynthesis && typeof window.speechSynthesis.cancel === 'function'){
    window.speechSynthesis.cancel();
  }

  isRecording = true;
  updateMicButton();
  setVoiceStatus('voice.status.listening');

  try {
    stopListening = audio.listen({
      lang: state.lang,
      onResult: (text, isFinal) => {
        const safeText = sanitizeVoiceText(text, 512);
        if (!safeText){
          if (isFinal){
            setVoiceStatus(getIdleVoiceKey());
          }
          return;
        }
        if (isFinal){
          if (input){
            input.value = safeText;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
            if (typeof input.setSelectionRange === 'function'){
              const len = safeText.length;
              input.setSelectionRange(len, len);
            }
          }
          setVoiceStatus(getIdleVoiceKey());
        } else {
          const preview = previewVoiceText(safeText);
          if (preview){
            setVoiceStatus('voice.status.partial', { text: preview });
          }
        }
      },
      onEnd: () => {
        isRecording = false;
        stopListening = null;
        updateMicButton();
        setVoiceStatus(getIdleVoiceKey());
      },
      onError: (event) => {
        console.error('Error de reconocimiento de voz', event);
        isRecording = false;
        stopListening = null;
        updateMicButton();
        setVoiceStatus('voice.status.error');
      }
    });
  } catch (err){
    console.error('No se pudo iniciar la captura de voz', err);
    isRecording = false;
    stopListening = null;
    updateMicButton();
    setVoiceStatus('voice.status.error');
  }
}

function stopRecording({ setIdle = true } = {}){
  if (stopListening){
    try {
      stopListening();
    } catch (err){
      console.warn('Error al detener la captura de voz', err);
    }
    stopListening = null;
  }
  if (isRecording){
    isRecording = false;
  }
  updateMicButton();
  if (setIdle){
    setVoiceStatus(getIdleVoiceKey());
  }
}

function handleMicToggle(){
  if (isRecording){
    stopRecording();
    return;
  }
  startRecording().catch((err) => {
    console.error('Error al iniciar la voz', err);
    setVoiceStatus('voice.status.error');
  });
}

async function maybeSpeakAssistant(text){
  if (!text || isRecording) return;
  const audio = await ensureAudioModule();
  if (!audio || !audio.hasTTS) return;
  const safeText = sanitizeVoiceText(text, 1600);
  if (!safeText) return;
  setVoiceStatus('voice.status.playing');
  const ok = audio.speak(safeText, state.lang, {
    onend: () => {
      if (!isRecording){
        setVoiceStatus(getIdleVoiceKey());
      }
    },
    onerror: (event) => {
      console.error('Error de síntesis de voz', event);
      if (!isRecording){
        setVoiceStatus('voice.status.error');
      }
    }
  });
  if (!ok && !isRecording){
    setVoiceStatus('voice.status.error');
  }
}

function initVoiceControls(){
  if (!micBtn){
    if (voiceStatus){
      setVoiceStatus('');
    }
    return;
  }

  setVoiceStatus('voice.status.loading');
  updateMicButton();

  const warm = () => {
    ensureAudioModule()
      .then(() => {
        updateMicButton();
        setVoiceStatus(getIdleVoiceKey());
      })
      .catch((err) => {
        console.error('El calentamiento de voz falló', err);
        setVoiceStatus('voice.status.error');
      });
  };

  micBtn.addEventListener('click', handleMicToggle);
  micBtn.addEventListener('pointerenter', warm, { once: true });
  micBtn.addEventListener('focus', warm, { once: true });

  ensureAudioModule()
    .then(() => {
      updateMicButton();
      setVoiceStatus(getIdleVoiceKey());
    })
    .catch((err) => {
      console.error('Error al iniciar los controles de voz', err);
      setVoiceStatus('voice.status.error');
    });
}

function addMessage(role, text){
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'me' : 'ai');
  div.dataset.role = role;
  if (role === 'assistant'){
    div.setAttribute('role', 'article');
    div.tabIndex = -1;
  }
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function focusAssistantMessage(node){
  if (!node || node.dataset.role !== 'assistant'){
    return;
  }
  if (!node.hasAttribute('tabindex')){
    node.tabIndex = -1;
  }
  requestAnimationFrame(() => {
    try {
      node.focus({ preventScroll: false });
    } catch {
      node.focus();
    }
  });
}

function applyTheme(theme, { persist = true } = {}){
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = normalized;
  themeButtons.forEach((btn) => {
    if (!btn) return;
    const nextTheme = normalized === 'dark' ? 'light' : 'dark';
    const labelKey = nextTheme === 'dark' ? 'controls.themeDark' : 'controls.themeLight';
    const actionKey = nextTheme === 'dark' ? 'controls.themeToggleToDark' : 'controls.themeToggleToLight';
    const label = translate(labelKey);
    const actionLabel = translate(actionKey);
    btn.textContent = label;
    btn.setAttribute('aria-label', actionLabel);
    btn.setAttribute('title', actionLabel);
    btn.dataset.theme = nextTheme;
    btn.setAttribute('aria-pressed', normalized === 'dark' ? 'true' : 'false');
  });
  if (persist){
    safeSet(themeKey, normalized);
  }
  state.theme = normalized;
}

function applyLanguage(lang, { persist = true } = {}){
  const normalized = ['es', 'en'].includes(lang) ? lang : 'es';
  state.lang = normalized;
  document.documentElement.lang = normalized;
  if (persist){
    safeSet(langKey, normalized);
  }
  langSelectors.forEach((select) => {
    if (!select) return;
    if (select.tagName === 'SELECT'){
      select.value = normalized;
      return;
    }
    if (select.matches('[data-action="toggle-language"]')){
      const nextLang = normalized === 'es' ? 'en' : 'es';
      const labelKey = nextLang === 'en' ? 'language.option.en' : 'language.option.es';
      const actionKey = nextLang === 'en' ? 'language.toggleToEn' : 'language.toggleToEs';
      const label = translate(labelKey);
      const actionLabel = translate(actionKey);
      if (label){
        select.textContent = label;
      }
      if (actionLabel){
        select.setAttribute('aria-label', actionLabel);
        select.setAttribute('title', actionLabel);
      }
      select.dataset.nextLang = nextLang;
      select.setAttribute('aria-pressed', normalized === 'en' ? 'true' : 'false');
      return;
    }
    const buttonLang = select.dataset?.lang;
    if (!buttonLang) return;
    const normalizedButtonLang = ['es', 'en'].includes(buttonLang) ? buttonLang : null;
    if (!normalizedButtonLang) return;
    const isActive = normalizedButtonLang === normalized;
    const labelKey = normalizedButtonLang === 'en' ? 'language.option.en' : 'language.option.es';
    const label = translate(labelKey);
    select.textContent = label;
    select.setAttribute('aria-label', label);
    select.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  if (window.I18N){
    window.I18N.apply(normalized);
  }
  refreshDynamicLocale();
  applyTheme(state.theme, { persist: false });
}

function applyMode(mode, { persist = true } = {}){
  const normalized = ['local', 'external'].includes(mode) ? mode : 'hybrid';
  state.mode = normalized;
  if (persist){
    safeSet(modeKey, normalized);
  }
  modeSelectors.forEach((select) => {
    if (select) select.value = normalized;
  });
}

function clientCheck(text){
  const check = window.Shield.scanAndSanitize(text, { maxLen: 2000, threshold: 12 });
  if (!check.ok){
    const reasons = (check.reasons || []).join(', ');
    if (reasons){
      setLocalizedText(warnEl, 'warnings.clientBlocked', { reasons });
    } else {
      setLocalizedText(warnEl, 'warnings.blockedInput');
    }
    return { ok: false };
  }
  setLocalizedText(warnEl, '');
  return { ok: true, sanitized: check.sanitized };
}

async function sendMessage(event){
  if (event){
    event.preventDefault();
  }
  if (isRecording){
    stopRecording();
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
  state.messages.push({ role: 'user', content: sanitized, lang: state.lang });
  input.value = '';
  updateSendAvailability();

  state.hp = honeypotField ? honeypotField.value || '' : '';
  const assistantBefore = state.messages.filter((message) => message.role === 'assistant').length;
  await routeChat({
    state: { ...state },
    ui: {
      chatEl: chat,
      warnEl,
      statusEl,
      addMsg: addMessage,
      focusAssistant: focusAssistantMessage
    }
  });

  const assistants = state.messages.filter((message) => message.role === 'assistant');
  if (assistants.length > assistantBefore){
    const latest = assistants[assistants.length - 1];
    if (latest && latest.content && latest.content !== lastSpokenText){
      lastSpokenText = latest.content;
      maybeSpeakAssistant(latest.content).catch((err) => {
        console.error('La síntesis de voz falló', err);
      });
    }
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

function initFooter(){
  const year = new Date().getFullYear();
  if (footerCopy){
    setLocalizedText(footerCopy, 'footer.copy', { year });
  }
  if (rightsPrimary){
    setLocalizedText(rightsPrimary, 'dialogs.rights.body1', { year }, { html: true });
  }
}

function initBudgetWatcher(){
  if (!budgetHint){
    return;
  }
  setInterval(() => {
    const text = Array.from(document.querySelectorAll('.msg.ai')).map((node) => node.textContent || '').join('');
    budgetHint.textContent = String(Math.ceil(text.length / 4));
  }, 800);
}

const dialogReturnFocus = new WeakMap();

function initDialogs(){
  dialogTriggers.forEach((trigger, index) => {
    const targetId = trigger?.dataset?.dialogTarget;
    if (!targetId) return;
    const dialog = document.getElementById(targetId);
    if (!(dialog instanceof HTMLDialogElement)) return;

    if (!trigger.id){
      trigger.id = `dialog-trigger-${targetId}-${index + 1}`;
    }

    trigger.setAttribute('aria-haspopup', 'dialog');
    if (!trigger.hasAttribute('aria-expanded')){
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', () => {
      dialogReturnFocus.set(dialog, trigger);
      const handleClose = () => {
        const opener = dialogReturnFocus.get(dialog) || trigger;
        dialogReturnFocus.delete(dialog);
        if (opener){
          opener.setAttribute('aria-expanded', 'false');
          opener.focus({ preventScroll: true });
        }
      };
      dialog.addEventListener('close', handleClose, { once: true });
      trigger.setAttribute('aria-expanded', 'true');
      if (typeof dialog.showModal === 'function'){
        dialog.showModal();
      } else {
        dialog.show();
      }
    });
  });

  dialogCloseButtons.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const dialog = btn.closest('dialog');
      dialog?.close(btn.value || 'close');
    });
  });

  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog){
        dialog.close('dismiss');
      }
    });
  });
}

function bindEvents(){
  if (!form || !chat || !input || !sendBtn || !statusEl || !warnEl){
    console.error('Faltan elementos críticos de la interfaz; se aborta la inicialización.');
    return;
  }

  const configurations = [
    {
      reference: 'chatForm.submit',
      link: '#chatForm',
      trigger: 'submit',
      action: 'message.submit',
      function: 'sendMessage'
    },
    {
      reference: 'sendButton.click',
      link: '#send',
      trigger: 'click',
      action: 'message.click',
      function: 'sendMessage'
    },
    {
      reference: 'input.keydown',
      link: '#input',
      trigger: 'keydown',
      action: 'message.enter',
      function: 'handleInputKeydown'
    },
    {
      reference: 'input.change',
      link: '#input',
      trigger: 'input',
      action: 'input.toggleSend',
      function: 'handleInputChange'
    },
    {
      reference: 'theme.toggle',
      link: '[data-action="toggle-theme"], [data-action="set-theme"]',
      trigger: 'click',
      action: 'theme.toggle',
      function: 'handleThemeToggle'
    },
    {
      reference: 'language.change',
      link: '[data-action="select-language"]',
      trigger: 'change',
      action: 'language.select',
      function: 'handleLanguageChange'
    },
    {
      reference: 'language.toggle',
      link: '[data-action="toggle-language"]',
      trigger: 'click',
      action: 'language.toggle',
      function: 'handleLanguageToggle'
    },
    {
      reference: 'language.activate',
      link: '[data-action="set-language"]',
      trigger: 'click',
      action: 'language.activate',
      function: 'handleLanguageActivate'
    },
    {
      reference: 'mode.change',
      link: '[data-action="select-mode"]',
      trigger: 'change',
      action: 'mode.select',
      function: 'handleModeChange'
    }
  ];

  wireConfigurations(configurations);
  updateSendAvailability();
}

function init(){
  applyMode(state.mode, { persist: false });
  applyLanguage(state.lang, { persist: false });
  applyTheme(state.theme, { persist: false });
  if (statusEl){
    setLocalizedText(statusEl, 'status.idle');
  }
  if (warnEl){
    warnEl.hidden = true;
  }
  initCookieBanner();
  initFooter();
  initDialogs();
  initBudgetWatcher();
  bindEvents();
  initVoiceControls();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
