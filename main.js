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
const budgetHint = qs('#budgetHint');
const cookieBanner = qs('#cookieBanner');
const acceptCookies = qs('#acceptCookies');
const declineCookies = qs('#declineCookies');
const copyrightYear = qs('#copyrightYear');

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

function translate(key, params){
  if (window.I18N && typeof window.I18N.t === 'function'){
    return window.I18N.t(state.lang, key, params);
  }
  return key;
}

function setLocalizedText(node, key, params){
  if (!node) return;
  if (!key){
    delete node.dataset.localeKey;
    delete node.dataset.localeParams;
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
  [statusEl, warnEl].forEach((node) => {
    if (!node) return;
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
    node.textContent = translate(key, params);
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
    btn.setAttribute('aria-label', translate(actionKey));
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

  await routeChat({
    state: { ...state },
    ui: {
      chatEl: chat,
      warnEl,
      statusEl,
      addMsg: addMessage
    }
  });
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
  if (copyrightYear){
    const now = new Date();
    copyrightYear.textContent = String(now.getFullYear());
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
  initBudgetWatcher();
  bindEvents();
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
