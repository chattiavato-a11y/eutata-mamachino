(function(global){
  const STRINGS = {
    en: {
      'header.title': 'OPS Chat Interface',
      'controls.themeLabel': 'Theme',
      'controls.languageLabel': 'Lang',
      'controls.modeLabel': 'Mode',
      'controls.themeDark': 'Dark',
      'controls.themeLight': 'Light',
      'controls.send': 'Send',
      'controls.placeholder': 'Type a message…',
      'controls.inputLabel': 'Chat message',
      'controls.mode.hybrid': 'Hybrid',
      'controls.mode.local': 'Local only',
      'controls.mode.external': 'External only',
      'controls.micStart': 'Start voice input',
      'controls.micStop': 'Stop voice input',
      'controls.tokensLabel': 'Session tokens:',
      'language.option.en': 'English',
      'language.option.es': 'Español',
      'cookie.remind': 'Remind me later',
      'cookie.accept': 'Agree & continue',
      'status.idle': 'Ready.',
      'status.connecting': 'Connecting…',
      'status.streaming': 'Streaming…',
      'status.streamingLocal': 'Streaming (local)…',
      'status.streamingLocalGpu': 'Streaming (local GPU)…',
      'status.thinkingLocal': 'Thinking locally…',
      'status.loadingLocalModel': 'Loading local model…',
      'status.loadingLocalModelProgress': 'Loading local model… {percent}%',
      'status.readyTokens': 'Ready. (≈{tokens} tokens)',
      'status.serverError': 'Server error.',
      'status.errorStream': 'Error starting stream.',
      'status.networkError': 'Network error.',
      'status.noLocalAnswer': 'No local answer available.',
      'voice.status.loading': 'Initializing voice controls…',
      'voice.status.idle': 'Voice ready.',
      'voice.status.listening': 'Listening…',
      'voice.status.partial': 'Heard: {text}',
      'voice.status.playing': 'Speaking response…',
      'voice.status.playback': 'Speech playback ready (microphone unavailable).',
      'voice.status.unsupported': 'Voice controls are not supported in this browser.',
      'voice.status.error': 'Voice control error.',
      'warnings.blockedInput': 'Blocked input.',
      'warnings.clientBlocked': 'Blocked by client Shield. Reasons: {reasons}',
      'warnings.sessionCap': 'Session token cap reached.',
      'warnings.sessionCapHard': 'Session token cap reached (100k).',
      'warnings.softCap': 'You are over the soft token cap (75k). Further generation will slow/trim.',
      'warnings.softCapShort': 'Soft cap exceeded (75k).',
      'warnings.webgpuMissing': 'WebGPU unavailable; using server fallback.',
      'warnings.localModelMissing': 'Local model not available; using server fallback.',
      'warnings.serverBudget': 'Insufficient budget for server call.'
    },
    es: {
      'header.title': 'Interfaz de Chat OPS',
      'controls.themeLabel': 'Tema',
      'controls.languageLabel': 'Idioma',
      'controls.modeLabel': 'Modo',
      'controls.themeDark': 'Oscuro',
      'controls.themeLight': 'Claro',
      'controls.send': 'Enviar',
      'controls.placeholder': 'Escribe un mensaje…',
      'controls.inputLabel': 'Mensaje de chat',
      'controls.mode.hybrid': 'Híbrido',
      'controls.mode.local': 'Solo local',
      'controls.mode.external': 'Solo externo',
      'controls.micStart': 'Iniciar entrada de voz',
      'controls.micStop': 'Detener entrada de voz',
      'controls.tokensLabel': 'Tokens de sesión:',
      'language.option.en': 'Inglés',
      'language.option.es': 'Español',
      'cookie.remind': 'Recuérdame más tarde',
      'cookie.accept': 'Aceptar y continuar',
      'status.idle': 'Listo.',
      'status.connecting': 'Conectando…',
      'status.streaming': 'Transmitiendo…',
      'status.streamingLocal': 'Transmitiendo (local)…',
      'status.streamingLocalGpu': 'Transmitiendo (GPU local)…',
      'status.thinkingLocal': 'Pensando localmente…',
      'status.loadingLocalModel': 'Cargando modelo local…',
      'status.loadingLocalModelProgress': 'Cargando modelo local… {percent}%',
      'status.readyTokens': 'Listo. (≈{tokens} tokens)',
      'status.serverError': 'Error del servidor.',
      'status.errorStream': 'Error al iniciar la transmisión.',
      'status.networkError': 'Error de red.',
      'status.noLocalAnswer': 'No hay respuesta local disponible.',
      'voice.status.loading': 'Inicializando controles de voz…',
      'voice.status.idle': 'Voz lista.',
      'voice.status.listening': 'Escuchando…',
      'voice.status.partial': 'Se oyó: {text}',
      'voice.status.playing': 'Reproduciendo respuesta…',
      'voice.status.playback': 'Reproducción disponible (micrófono no detectado).',
      'voice.status.unsupported': 'Los controles de voz no son compatibles en este navegador.',
      'voice.status.error': 'Error en el control de voz.',
      'warnings.blockedInput': 'Entrada bloqueada.',
      'warnings.clientBlocked': 'Bloqueado por Shield del cliente. Motivos: {reasons}',
      'warnings.sessionCap': 'Límite de tokens de sesión alcanzado.',
      'warnings.sessionCapHard': 'Límite de tokens de sesión alcanzado (100k).',
      'warnings.softCap': 'Has superado el límite blando de tokens (75k). Las respuestas futuras serán más lentas o recortadas.',
      'warnings.softCapShort': 'Límite blando superado (75k).',
      'warnings.webgpuMissing': 'WebGPU no disponible; usando respaldo del servidor.',
      'warnings.localModelMissing': 'Modelo local no disponible; usando respaldo del servidor.',
      'warnings.serverBudget': 'Presupuesto insuficiente para la llamada al servidor.'
    }
  };

  function resolve(lang, key){
    const dict = STRINGS[lang];
    if (dict && Object.prototype.hasOwnProperty.call(dict, key)){
      return dict[key];
    }
    if (lang !== 'en'){ return resolve('en', key); }
    return undefined;
  }

  function format(template, params){
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
    });
  }

  function translate(lang, key, params){
    const template = resolve(lang, key);
    if (template === undefined){
      return key;
    }
    return format(String(template), params);
  }

  function apply(lang){
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((el) => {
      const key = el.dataset.i18n;
      if (!key) return;
      const text = translate(lang, key);
      if (text !== undefined){
        if (el.dataset.i18nHtml === 'true'){
          el.innerHTML = text;
        } else {
          el.textContent = text;
        }
      }
    });

    const attrElements = document.querySelectorAll('[data-i18n-attrs]');
    attrElements.forEach((el) => {
      const mapping = (el.dataset.i18nAttrs || '').split(',');
      mapping.forEach((pair) => {
        if (!pair.trim()) return;
        const [attr, key] = pair.split(':').map((part) => part.trim());
        if (!attr || !key) return;
        const value = translate(lang, key);
        if (value === undefined) return;
        if (attr === 'placeholder'){
          el.setAttribute('placeholder', value);
        } else if (attr === 'aria-label'){
          el.setAttribute('aria-label', value);
        } else if (attr === 'title'){
          el.setAttribute('title', value);
        } else {
          el.setAttribute(attr, value);
        }
      });
    });
  }

  global.I18N = {
    strings: STRINGS,
    t: translate,
    apply
  };
})(window);
