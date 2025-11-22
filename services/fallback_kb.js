// fallback_kb.js — client-side emergency fallback for Chattia (EN/ES)
// - Friendly greetings and small talk
// - Simple, service-focused answers using an embedded OPS directory
// - Exposes window.FallbackKB.reply(text, lang?)

(function () {
  "use strict";

  const SERVICE_DIRECTORY = Object.freeze({
    overview: {
      name: "OPS Remote Professional Network",
      focus:
        "OPS connects you with experienced remote professionals in Business Operations, Contact Center, IT Support, and Professionals On Demand so you can extend your team without adding full-time headcount right away.",
      focusEs:
        "OPS te conecta con profesionales remotos con experiencia en Operaciones de Negocio, Contact Center, Soporte IT y Profesionales On Demand para ampliar tu equipo sin sumar nómina fija de inmediato."
    },
    servicePillars: [
      {
        name: "Business Operations",
        summary:
          "We keep your day-to-day engine running: clear billing, tidy payables/receivables, organized vendors, and dashboards leadership can actually use.",
        summaryEs:
          "Cuidamos el motor del día a día: facturación clara, cuentas por pagar/cobrar ordenadas, proveedores organizados y tableros que la dirección realmente puede usar."
      },
      {
        name: "Contact Center (Beta)",
        summary:
          "We help you build warm, consistent conversations with customers across channels, balancing speed with long-term relationships.",
        summaryEs:
          "Te ayudamos a crear conversaciones cálidas y consistentes con tus clientes en varios canales, equilibrando rapidez con relaciones de largo plazo."
      },
      {
        name: "IT Support (Beta)",
        summary:
          "We give you incident-ready teams that guide users, handle tickets, and coordinate fixes so work can keep moving.",
        summaryEs:
          "Te damos equipos preparados para incidentes que guían a las personas usuarias, manejan tickets y coordinan soluciones para que el trabajo no se detenga."
      },
      {
        name: "Professionals",
        summary:
          "We add extra brains on the problem: teams that read your data, spot patterns, and turn insights into practical next steps.",
        summaryEs:
          "Sumamos mentes extra a tus retos: equipos que leen tus datos, detectan patrones y convierten los insights en próximos pasos concretos."
      }
    ],
    solutions: [
      {
        name: "Business Operations",
        coverage:
          "Billing, payables and receivables, vendor coordination, admin support, and marketing support so the internal engine stays organized.",
        coverageEs:
          "Facturación, cuentas por pagar y cobrar, coordinación con proveedores, soporte administrativo y apoyo en marketing para que el motor interno se mantenga ordenado."
      },
      {
        name: "Contact Center (Beta)",
        coverage:
          "Relationship-driven service across channels with quick, consistent answers and a human tone of voice.",
        coverageEs:
          "Servicio multicanal centrado en la relación, con respuestas rápidas, consistentes y un tono humano."
      },
      {
        name: "IT Support (Beta)",
        coverage:
          "Practical IT help desk coverage (Tiers I–II), incident handling, and specialist tracks for more complex issues.",
        coverageEs:
          "Mesa de ayuda práctica (niveles I–II), manejo de incidentes y rutas especializadas para casos más complejos."
      },
      {
        name: "Professionals On Demand",
        coverage:
          "Assistants, specialists, and consultants you can plug in quickly for sprints or longer-term engagements.",
        coverageEs:
          "Asistentes, especialistas y consultores que puedes incorporar rápido para sprints o compromisos de más largo plazo."
      }
    ],
    proofPoints: [
      "24/7 follow-the-sun coverage",
      "Noticeably faster resolution times",
      "High availability for remote operations",
      "Security posture strengthened through the OPS CyberSec Core framework"
    ],
    proofPointsEs: [
      "Cobertura 24/7 con equipos distribuidos",
      "Tiempos de resolución visiblemente más rápidos",
      "Alta disponibilidad para operaciones remotas",
      "Postura de seguridad reforzada a través del marco OPS CyberSec Core"
    ],
    contactPathways: [
      "Book a discovery call to map your operational needs",
      "Talk directly with OPS about integrations and CX roadmaps",
      "Hire remote specialists across operations, CX, IT support, and on-demand talent"
    ],
    contactPathwaysEs: [
      "Agendar una discovery call para mapear tus necesidades operativas",
      "Hablar directamente con OPS sobre integraciones y roadmaps de CX",
      "Contratar especialistas remotos en operaciones, CX, soporte IT y talento on-demand"
    ]
  });

  const GREET_EN = [
    "Hi! I’m Chattia, your OPS guide. What would you like help with today?",
    "Hello and welcome 👋 Are you looking for services, pricing, or just exploring options?",
    "Hey there! Do you need support for Business Operations, a Contact Center, IT, or a specific specialist?",
    "Welcome to OPS Remote Professional Network. Tell me a bit about your situation and I’ll suggest the best fit.",
    "Good to see you here! I can give a quick overview or go into detail—what are you curious about?",
    "Hi! Quick tour if you’d like: Business Operations, Contact Center (beta), IT Support (beta), and Professionals On Demand.",
    "Hello! Ask me about availability, timelines, or how we’d work with a team like yours.",
    "Hi! Prefer a short summary or a deeper conversation? I’m happy to do either."
  ];

  const GREET_ES = [
    "¡Hola! Soy Chattia, tu guía en OPS. ¿En qué te gustaría que te ayude hoy?",
    "¡Bienvenido/a 👋! ¿Buscas servicios, precios o solo quieres conocer tus opciones?",
    "¡Hey! ¿Necesitas apoyo en Operaciones de Negocio, Contact Center, Soporte IT o un/a especialista puntual?",
    "Bienvenido/a a OPS Remote Professional Network. Cuéntame tu situación y te propongo la mejor combinación.",
    "¡Qué bueno tenerte aquí! Puedo darte un resumen rápido o entrar en detalle, ¿qué prefieres?",
    "¡Hola! Tour rápido: Operaciones de Negocio, Contact Center (beta), Soporte IT (beta) y Profesionales On-Demand.",
    "¡Hola! Pregúntame por disponibilidad, plazos o cómo trabajaríamos con tu equipo.",
    "¡Hola! ¿Quieres un resumen breve o una explicación más completa? Me adapto a lo que necesites."
  ];

  const ANSWERS = {
    services_en:
      "We offer four main service lines, all with remote professionals:\n• Business Operations – Keep billing, payables/receivables, vendors, and admin work under control.\n• Contact Center (Beta) – Agents who build relationships across chat, voice, and other channels.\n• IT Support (Beta) – Practical help desk coverage and incident handling for day-to-day tech issues.\n• Professionals On Demand – Specialists and consultants you can plug in for projects or ongoing support.\nIf you tell me what kind of operation you run, I can suggest a starting point.",
    services_es:
      "Tenemos cuatro líneas principales de servicio con talento remoto:\n• Business Operations – Orden en facturación, cobros/pagos, proveedores y soporte administrativo.\n• Contact Center (Beta) – Agentes que cuidan la relación con tus clientes en varios canales.\n• IT Support (Beta) – Mesa de ayuda práctica y manejo de incidentes para tu día a día tecnológico.\n• Professionals On Demand – Especialistas y consultores que se suman a proyectos o a tu operación.\nCuéntame qué tipo de operación tienes y te sugiero por dónde empezar.",
    contact_center_en:
      "Great—let’s focus on your contact center.\nWe can support you with remote agents, team leads, quality support and ops specialists who help you:\n• Cover more hours across chat, voice and messaging\n• Keep knowledge bases fresh so answers stay consistent\n• Track satisfaction and resolution time\n• Add extra hands during campaigns or busy seasons\nTell me your current setup (channels, hours, team size) and I’ll outline a few options.",
    contact_center_es:
      "Perfecto, hablemos de tu contact center.\nPodemos apoyarte con agentes remotos, leads de equipo y especialistas en operaciones para:\n• Cubrir más horas en chat, voz y mensajería\n• Mantener actualizada tu base de conocimiento\n• Seguir indicadores de satisfacción y tiempo de resolución\n• Sumar manos extra en campañas o temporadas altas\nCuéntame cómo trabajas hoy (canales, horarios, tamaño de equipo) y te propongo opciones.",
    pro_on_demand_en:
      "Got it—you’re looking for a specific person, not just a service.\nWe can match you with Professionals On Demand: assistants, specialists or consultants for short sprints or long-term work.\nTell me what you’re trying to achieve, the skills you’re looking for, and whether you prefer part-time, full-time, or project-based help.",
    pro_on_demand_es:
      "Entendido, buscas a una persona concreta, no solo un servicio.\nPodemos conectarte con Professionals On Demand: asistentes, especialistas o consultores para proyectos cortos o trabajo de largo plazo.\nCuéntame qué objetivo tienes, qué habilidades buscas y si prefieres apoyo por horas, tiempo completo o por proyecto.",
    it_support_en:
      "Yes—IT Support (Beta) is one of our pillars. We provide practical help desk coverage (Tier I–II), ticket handling, incident response, and specialist tracks for trickier issues. Share your tools, time zones, and ticket volume, and I’ll map a coverage plan.",
    it_support_es:
      "Sí, Soporte IT (beta) es uno de nuestros pilares. Damos cobertura práctica de mesa de ayuda (niveles I–II), manejo de tickets, respuesta a incidentes y rutas especializadas para casos complejos. Cuéntame tus herramientas, zonas horarias y volumen de tickets y te propongo un plan de cobertura.",
    business_ops_en:
      "We can take on Business Operations so your back office stays organized: billing, payables/receivables, vendor coordination, admin support, and marketing assistance. If you share your current gaps, I can recommend a starter pod or individual specialist.",
    business_ops_es:
      "Podemos encargarnos de Operaciones de Negocio para mantener tu back-office en orden: facturación, cuentas por pagar/cobrar, coordinación con proveedores, soporte administrativo y ayuda en marketing. Si me cuentas tus brechas actuales, te recomiendo un pod inicial o un/a especialista.",
    availability_en:
      "Happy to talk availability, timelines, or pricing. Share your context and target start; we usually reply within one business day. Most teams can spin up in days with flexible schedules/time zones. Pricing is tailored after a quick discovery call—want to compare a few options?",
    availability_es:
      "Con gusto hablamos de disponibilidad, tiempos o precios. Cuéntame tu contexto y fecha objetivo; normalmente respondemos dentro de un día hábil. La mayoría de los equipos pueden activarse en pocos días con horarios y zonas horarias flexibles. Los precios se ajustan tras una breve discovery call. ¿Quieres revisar opciones?"
  };

  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  function getFocus(lang) {
    const o = SERVICE_DIRECTORY.overview;
    return lang === "es" ? o.focusEs || o.focus : o.focus;
  }

  function getPillars(lang) {
    const isEs = lang === "es";
    return SERVICE_DIRECTORY.servicePillars.map((p) =>
      `${p.name} — ${isEs ? p.summaryEs || p.summary : p.summary}`
    );
  }

  function listPillars(lang, bullet = "• ") {
    return getPillars(lang)
      .map((entry) => `${bullet}${entry}`)
      .join("\n");
  }

  function getProofPoints(lang) {
    const d = SERVICE_DIRECTORY;
    return lang === "es" ? d.proofPointsEs || d.proofPoints : d.proofPoints;
  }

  function getSolutions(lang) {
    const isEs = lang === "es";
    return SERVICE_DIRECTORY.solutions.map((s) =>
      `${s.name} — ${isEs ? s.coverageEs || s.coverage : s.coverage}`
    );
  }

  function getContactPathways(lang) {
    const d = SERVICE_DIRECTORY;
    return lang === "es"
      ? d.contactPathwaysEs || d.contactPathways
      : d.contactPathways;
  }

  function buildOverview(lang, withProof = false) {
    const nameLine = `${SERVICE_DIRECTORY.overview.name} — ${getFocus(lang)}`;
    const pillarList = listPillars(lang);
    const proofList = getProofPoints(lang)
      .map((item) => `• ${item}`)
      .join("\n");

    if (lang === "es") {
      const base = `${nameLine}\n\nPilares de servicio:\n${pillarList}`;
      if (!withProof) {
        return `${base}\n\n¿Quieres ver opciones o agendar una discovery call? Normalmente respondemos en un día hábil.`;
      }
      return (
        `${base}\n\nResultados que buscamos:\n${proofList}\n\n¿Quieres ver opciones o agendar una discovery call? Normalmente respondemos en un día hábil.`
      );
    }

    const base = `${nameLine}\n\nService pillars:\n${pillarList}`;
    if (!withProof) {
      return `${base}\n\nWant options or a discovery call? We usually reply within one business day.`;
    }
    return (
      `${base}\n\nSome of the results we focus on:\n${proofList}\n\nWant options or a discovery call? We usually reply within one business day.`
    );
  }

  function detectLang(text, hint) {
    if (hint) return hint.toLowerCase().startsWith("es") ? "es" : "en";
    return /[áéíóúñü¿¡]/i.test(text) ? "es" : "en";
  }

  function isGreeting(text) {
    return /\b(hi|hello|hey|howdy|yo|hiya|good\s*(morning|afternoon|evening)|hola|buenas|buen\s*d[ií]a|qué\s*tal)\b/i.test(
      text
    );
  }

  const KB = [
    {
      id: "contact-center.en",
      lang: "en",
      q: /(contact\s*center|call\s*center|support\s*center|phone\s+and\s+chat|multi[-\s]?channel|cx\s*(team)?)/i,
      a: () => ANSWERS.contact_center_en
    },
    {
      id: "contact-center.es",
      lang: "es",
      q: /(contact\s*center|call\s*center|centro\s+de\s+(atenci[oó]n|contacto)|callcenter|equipo\s+de\s+soporte|voz\s+y\s+chat)/i,
      a: () => ANSWERS.contact_center_es
    },
    {
      id: "pro-on-demand.en",
      lang: "en",
      q: /(professional|specialist|consultant|assistant|individual\s+contributor|on[-\s]?demand|one\s+person|single\s+role)/i,
      a: () => ANSWERS.pro_on_demand_en
    },
    {
      id: "pro-on-demand.es",
      lang: "es",
      q: /(profesional|especialista|consultor|asistente|persona\s+(buena|puntual)|una\s+persona|talento\s+on[-\s]?demand)/i,
      a: () => ANSWERS.pro_on_demand_es
    },
    {
      id: "it-support.en",
      lang: "en",
      q: /(it\s+support|help\s*desk|tickets?|incidents?|tier\s*(i|1|ii|2)|tech\s+support)/i,
      a: () => ANSWERS.it_support_en
    },
    {
      id: "it-support.es",
      lang: "es",
      q: /(soporte\s+it|soporte\s+ti|mesa\s+de\s+ayuda|tickets?|incidentes?|nivel\s*(i|1|ii|2)|soporte\s+t[eé]cnico)/i,
      a: () => ANSWERS.it_support_es
    },
    {
      id: "business-ops.en",
      lang: "en",
      q: /(business\s+operations|back[-\s]?office|billing|payables|receivables|vendors?|procurement|invoicing|admin\s+tasks?)/i,
      a: () => ANSWERS.business_ops_en
    },
    {
      id: "business-ops.es",
      lang: "es",
      q: /(operaciones\s+de\s+negocio|back[-\s]?office|facturaci[oó]n|facturas|proveedores|compras|cuentas\s+por\s+(pagar|cobrar)|tareas\s+administrativas)/i,
      a: () => ANSWERS.business_ops_es
    },
    {
      id: "availability.en",
      lang: "en",
      q: /(availability|how\s+soon|start|onboard|pricing|cost|budget|timeline|timeframe|how\s+quickly|response\s+time)/i,
      a: () => ANSWERS.availability_en
    },
    {
      id: "availability.es",
      lang: "es",
      q: /(disponibilidad|cu[aá]nto\s+tiempo|empezar|integrarse|precios?|presupuesto|plazos?|qu[eé]\s+tan\s+rápido|responden)/i,
      a: () => ANSWERS.availability_es
    },
    {
      id: "services.en",
      lang: "en",
      q: /(services?|service\s+areas?|what\s+do\s+you\s+offer|offerings?|pillars|capabilities)/i,
      a: () => ANSWERS.services_en
    },
    {
      id: "services.es",
      lang: "es",
      q: /(servicios|pilares|qué\s+ofrecen|que\s+ofrecen|ofrecen|áreas\s+principales)/i,
      a: () => ANSWERS.services_es
    },
    {
      id: "overview.en",
      lang: "en",
      q: /(what\s+is|who\s+are|about|overview|summary|intro|explain)\b|^ops\b|^chattia\b/i,
      a: () => buildOverview("en", true)
    },
    {
      id: "overview.es",
      lang: "es",
      q: /(qué\s+es|quiénes\s+son|acerca|resumen|introducci[oó]n|explica|explicaci[oó]n)\b|^ops\b|^chattia\b/i,
      a: () => buildOverview("es", true)
    },
    {
      id: "solutions.en",
      lang: "en",
      q: /\b(solutions?|catalog|packages|what\s+problems|use\s+cases|examples)\b/i,
      a: () => {
        const list = getSolutions("en").map((s) => "• " + s).join("\n");
        return `Solutions\n${list}`;
      }
    },
    {
      id: "solutions.es",
      lang: "es",
      q: /\b(soluciones?|cat[aá]logo|paquetes|casos\s+de\s+uso|ejemplos)\b/i,
      a: () => {
        const list = getSolutions("es").map((s) => "• " + s).join("\n");
        return `Soluciones\n${list}`;
      }
    },
    {
      id: "proof.en",
      lang: "en",
      q: /\b(results?|metrics|proof|sla|availability|uptime|speed|security|compliance)\b/i,
      a: () => {
        const list = getProofPoints("en").map((p) => "- " + p).join("\n");
        return `Operational Highlights\n${list}`;
      }
    },
    {
      id: "proof.es",
      lang: "es",
      q: /\b(resultados?|m[eé]tricas|pruebas|sla|disponibilidad|seguridad|cumplimiento)\b/i,
      a: () => {
        const list = getProofPoints("es").map((p) => "- " + p).join("\n");
        return `Pruebas Operativas\n${list}`;
      }
    },
    {
      id: "contact.en",
      lang: "en",
      q: /\b(contact|reach|call|book|consult|hire|talk|email|phone|discovery)\b/i,
      a: () => {
        const lines = getContactPathways("en").map((l) => "- " + l).join("\n");
        return (
          `Contact & Hiring Paths\n${lines}\n` +
          `Share your context and preferred times; we usually reply within one business day.`
        );
      }
    },
    {
      id: "contact.es",
      lang: "es",
      q: /\b(contacto|llamar|agendar|consulta|contratar|hablar|correo|tel[eé]fono|descubrimiento)\b/i,
      a: () => {
        const lines = getContactPathways("es").map((l) => "- " + l).join("\n");
        return (
          `Rutas de Contacto y Contratación\n${lines}\n` +
          `Cuéntanos tu contexto y horarios; normalmente respondemos dentro de un día hábil.`
        );
      }
    }
  ];

  function reply(userText, langHint) {
    const text = (userText || "").trim();
    const lang = detectLang(text, langHint);

    if (!text || isGreeting(text)) {
      return lang === "es" ? pick(GREET_ES) : pick(GREET_EN);
    }

    const bank = KB.filter((k) => k.lang === lang);

    for (const item of bank) {
      if (item.q.test(text)) return item.a();
    }

    return buildOverview(lang, false);
  }

  window.FallbackKB = Object.freeze({ reply });
})();
