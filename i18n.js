(function(global){
  const STRINGS = {
    en: {
      'header.title': 'OPS Chat Interface',
      'chat.title': 'Session Console',
      'controls.themeLabel': 'Theme',
      'controls.languageLabel': 'Language',
      'controls.modeLabel': 'Mode',
      'controls.themeDark': 'Dark',
      'controls.themeLight': 'Light',
      'controls.themeToggleToLight': 'Switch to light theme',
      'controls.themeToggleToDark': 'Switch to dark theme',
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
      'language.option.es': 'Spanish',
      'language.toggleToEn': 'Switch to English',
      'language.toggleToEs': 'Switch to Spanish',
      'cookie.remind': 'Remind me later',
      'cookie.accept': 'Agree & continue',
      'footer.cookieLink': 'Cookie Consent',
      'footer.termsLink': 'Terms & Conditions',
      'footer.rightsLink': 'Trademark & Copyright',
      'footer.copy': '© {year} ShieldOps Consortium. All rights reserved.',
      'dialogs.close': 'Close',
      'dialogs.cookie.title': 'Cookie Consent',
      'dialogs.cookie.body1': 'We only deploy essential cookies required to secure the session, detect abuse, and remember your accessibility preferences. Analytics are aggregated, anonymous, and never include personal identifiers.',
      'dialogs.cookie.body2': 'Your chat content remains local-first unless policy escalates it to protected infrastructure. Declining optional cookies keeps the experience functional without personalization.',
      'dialogs.terms.title': 'Terms & Conditions',
      'dialogs.terms.body1': 'By engaging with this assistant you agree to follow acceptable use rules, refrain from submitting malicious or regulated data, and respect all confidentiality markings produced by the system.',
      'dialogs.terms.body2': 'Service is provided on an “as-is” basis without warranties. Availability targets follow PCI DSS operational practices and disputes are governed by the applicable laws of your jurisdiction.',
      'dialogs.rights.title': 'Trademark & Copyright',
      'dialogs.rights.body1': '© <span id="copyrightYear">{year}</span> ShieldOps Consortium. All rights reserved. ShieldOps, the Shield insignia, and related marks are protected trademarks.',
      'dialogs.rights.body2': 'Unauthorized reproduction, redistribution, or modification of platform assets is prohibited. Third-party names remain the property of their respective owners and are referenced solely for identification.',
      'status.idle': 'Ready.',
      'status.connecting': 'Connecting…',
      'status.streaming': 'Streaming…',
      'status.streamingLocal': 'Streaming (local)…',
      'status.streamingLocalGpu': 'Streaming (local GPU)…',
      'status.thinkingLocal': 'Thinking locally…',
      'status.loadingLocalModel': 'Loading local model…',
      'status.loadingLocalModelProgress': 'Loading local model… {percent}%',
      'status.readyTokens': '≈{tokens} tokens available',
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
      'header.title': 'Interfaz de chat OPS',
      'chat.title': 'Consola de sesión',
      'controls.themeLabel': 'Tema',
      'controls.languageLabel': 'Idioma',
      'controls.modeLabel': 'Modo',
      'controls.themeDark': 'Oscuro',
      'controls.themeLight': 'Claro',
      'controls.themeToggleToLight': 'Cambiar a tema claro',
      'controls.themeToggleToDark': 'Cambiar a tema oscuro',
      'controls.send': 'Enviar',
      'controls.placeholder': 'Escribe un mensaje…',
      'controls.inputLabel': 'Mensaje de chat',
      'controls.mode.hybrid': 'Híbrido',
      'controls.mode.local': 'Solo local',
      'controls.mode.external': 'Solo externo',
      'controls.micStart': 'Iniciar entrada de voz',
      'controls.micStop': 'Detener entrada de voz',
      'controls.tokensLabel': 'Uso de tokens:',
      'language.option.en': 'Inglés',
      'language.option.es': 'Español',
      'language.toggleToEn': 'Cambiar a inglés',
      'language.toggleToEs': 'Cambiar a español',
      'cookie.remind': 'Recuérdame más tarde',
      'cookie.accept': 'Aceptar y continuar',
      'footer.cookieLink': 'Consentimiento de cookies',
      'footer.termsLink': 'Términos y condiciones',
      'footer.rightsLink': 'Marcas registradas y derechos de autor',
      'footer.copy': '© {year} ShieldOps Consortium. Todos los derechos reservados.',
      'dialogs.close': 'Cerrar',
      'dialogs.cookie.title': 'Consentimiento de cookies',
      'dialogs.cookie.body1': 'Solo implementamos cookies esenciales necesarias para asegurar la sesión, detectar abusos y recordar tus preferencias de accesibilidad. Las analíticas son agregadas, anónimas y nunca incluyen identificadores personales.',
      'dialogs.cookie.body2': 'Tu contenido de chat permanece local por defecto a menos que una política lo escale a infraestructura protegida. Rechazar las cookies opcionales mantiene la experiencia funcional sin personalización.',
      'dialogs.terms.title': 'Términos y condiciones',
      'dialogs.terms.body1': 'Al utilizar este asistente aceptas seguir las reglas de uso permitido, abstenerte de enviar datos maliciosos o regulados y respetar todas las marcas de confidencialidad que produzca el sistema.',
      'dialogs.terms.body2': 'El servicio se ofrece “tal cual”, sin garantías. Los objetivos de disponibilidad siguen las prácticas operativas de PCI DSS y las disputas se rigen por las leyes aplicables de tu jurisdicción.',
      'dialogs.rights.title': 'Marcas registradas y derechos de autor',
      'dialogs.rights.body1': '© <span id="copyrightYear">{year}</span> ShieldOps Consortium. Todos los derechos reservados. ShieldOps, el emblema Shield y las marcas relacionadas están protegidas.',
      'dialogs.rights.body2': 'Se prohíbe la reproducción, redistribución o modificación no autorizada de los activos de la plataforma. Los nombres de terceros siguen siendo propiedad de sus respectivos dueños y se mencionan solo para identificación.',
      'status.idle': '',
      'status.connecting': 'Conectando…',
      'status.streaming': 'Transmitiendo…',
      'status.streamingLocal': 'Transmitiendo (local)…',
      'status.streamingLocalGpu': 'Transmitiendo (GPU local)…',
      'status.thinkingLocal': 'Pensando localmente…',
      'status.loadingLocalModel': 'Cargando modelo local…',
      'status.loadingLocalModelProgress': 'Cargando modelo local… {percent}%',
      'status.readyTokens': '≈{tokens} tokens disponibles',
      'status.serverError': 'Error del servidor.',
      'status.errorStream': 'Error al iniciar la transmisión.',
      'status.networkError': 'Error de red.',
      'status.noLocalAnswer': 'No hay respuesta local disponible.',
      'voice.status.loading': 'Inicializando controles de voz…',
      'voice.status.idle': 'Voz lista.',
      'voice.status.listening': 'Escuchando…',
      'voice.status.partial': 'Se oyó: {text}',
      'voice.status.playing': 'Reproduciendo respuesta…',
      'voice.status.playback': 'Reproducción de voz lista (micrófono no disponible).',
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
