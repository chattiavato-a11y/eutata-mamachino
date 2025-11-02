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
const langSelectors = qsa('[data-action="select-language"]');
const themeButtons = qsa('[data-action="toggle-theme"]');
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
  lang: safeGet(langKey) || 'en',
  theme: safeGet(themeKey) || (prefersLight ? 'light' : 'dark'),
  mode: safeGet(modeKey) || 'hybrid',
  csrf: window.Shield.csrfToken(),
  hp: '',
  analytics: safeGet(consentKey) === 'all',
  webllmModel: 'Llama-3.1-8B-Instruct-q4f16_1'
};

const honeypotField = form && window.Shield.attachHoneypot ? window.Shield.attachHoneypot(form) : null;

let audioModulePromise = null;
let audioModule = null;
let stopListening = null;
let isRecording = false;
let lastSpokenText = '';
const voicePreviewLimit = 80;

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
        console.error('Failed to load audio module', err);
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
        console.error('Speech recognition error', event);
        isRecording = false;
        stopListening = null;
        updateMicButton();
        setVoiceStatus('voice.status.error');
      }
    });
  } catch (err){
    console.error('Failed to start voice capture', err);
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
      console.warn('Error stopping voice capture', err);
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
    console.error('Voice start error', err);
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
      console.error('Speech synthesis error', event);
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
        console.error('Voice warmup failed', err);
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
      console.error('Voice init error', err);
      setVoiceStatus('voice.status.error');
    });
}

function addMessage(role, text){
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'me' : 'ai');
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function applyTheme(theme, { persist = true } = {}){
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = normalized;
  const labelKey = normalized === 'dark' ? 'controls.themeDark' : 'controls.themeLight';
  const actionKey = normalized === 'dark' ? 'controls.themeToggleToLight' : 'controls.themeToggleToDark';
  themeButtons.forEach((btn) => {
    btn.textContent = translate(labelKey);
    btn.setAttribute('aria-pressed', normalized === 'dark' ? 'true' : 'false');
    btn.setAttribute('aria-label', translate(labelKey));
  });
  if (persist){
    safeSet(themeKey, normalized);
  }
  state.theme = normalized;
}

function applyLanguage(lang, { persist = true } = {}){
  const normalized = lang === 'es' ? 'es' : 'en';
  state.lang = normalized;
  document.documentElement.lang = normalized;
  if (persist){
    safeSet(langKey, normalized);
  }
  langSelectors.forEach((select) => {
    if (select) select.value = normalized;
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

  state.hp = honeypotField ? honeypotField.value || '' : '';
  const assistantBefore = state.messages.filter((message) => message.role === 'assistant').length;
  await routeChat({
    state: { ...state },
    ui: {
      chatEl: chat,
      warnEl,
      statusEl,
      addMsg: addMessage
    }
  });

  const assistants = state.messages.filter((message) => message.role === 'assistant');
  if (assistants.length > assistantBefore){
    const latest = assistants[assistants.length - 1];
    if (latest && latest.content && latest.content !== lastSpokenText){
      lastSpokenText = latest.content;
      maybeSpeakAssistant(latest.content).catch((err) => {
        console.error('Speech synthesis failed', err);
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
    console.error('Critical UI elements missing; aborting init.');
    return;
  }

  form.addEventListener('submit', sendMessage);
  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey){
      event.preventDefault();
      sendMessage();
    }
  });

  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    });
  });

  langSelectors.forEach((select) => {
    select.addEventListener('change', (event) => {
      applyLanguage(event.target.value);
    });
  });

  modeSelectors.forEach((select) => {
    select.addEventListener('change', (event) => {
      applyMode(event.target.value);
    });
  });
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
