// services/directory.js — OPS service directory + friendly prompts for higher layers

export const SERVICE_DIRECTORY = Object.freeze({
  overview: {
    name: "OPS Remote Professional Network",
    focus:
      "OPS Online Support connects you with experienced remote professionals across Business Operations, Contact Center, IT Support, and Professionals On Demand so you can extend your team in a flexible way.",
    focusEs:
      "OPS Online Support te conecta con profesionales remotos con experiencia en Operaciones de Negocio, Contact Center, Soporte IT y Profesionales On Demand para que amplíes tu equipo de forma flexible."
  },
  servicePillars: [
    {
      name: "Business Operations",
      summary:
        "We keep your operations tidy and visible: financial hygiene, clear stakeholder updates, and executive dashboards backed by accurate billing and procurement visibility.",
      summaryEs:
        "Mantenemos tus operaciones en orden y a la vista: higiene financiera, actualizaciones claras para stakeholders y tableros ejecutivos respaldados por facturación precisa y visibilidad de compras."
    },
    {
      name: "Contact Center (Beta)",
      summary:
        "We help you build long-term relationships with customers through omni-channel routing and structured knowledge that keeps answers quick and consistent.",
      summaryEs:
        "Te ayudamos a construir relaciones de largo plazo con tus clientes mediante enrutamiento omnicanal y conocimiento estructurado que mantiene respuestas rápidas y consistentes."
    },
    {
      name: "IT Support (Beta)",
      summary:
        "We provide incident-ready teams with documented triage paths and a view that connects tickets, tools, and continuity so the business can keep moving.",
      summaryEs:
        "Ofrecemos equipos preparados para incidentes con rutas de triaje documentadas y una visión que conecta tickets, herramientas y continuidad para que el negocio siga en marcha."
    },
    {
      name: "Professionals",
      summary:
        "We bring insight-driven teams who read your data, highlight risks and opportunities, and co-design action plans from quick experiments to longer-term improvements.",
      summaryEs:
        "Aportamos equipos guiados por insights que leen tus datos, resaltan riesgos y oportunidades y co-diseñan planes de acción, desde experimentos rápidos hasta mejoras de largo plazo."
    }
  ],
  solutions: [
    {
      name: "Business Operations",
      coverage:
        "Back-office support for billing, payables and receivables, vendor coordination, administrative tasks, and marketing support so your core team can focus on higher-value work.",
      coverageEs:
        "Soporte de back-office para facturación, cuentas por pagar y cobrar, coordinación con proveedores, tareas administrativas y apoyo en marketing para que tu equipo central se concentre en trabajo de mayor valor."
    },
    {
      name: "Contact Center (Beta)",
      coverage:
        "Multi-channel, relationship-driven customer service that balances speed and human warmth with quick, consistent resolutions.",
      coverageEs:
        "Atención al cliente multicanal centrada en la relación, que equilibra rapidez y calidez humana con resoluciones rápidas y consistentes."
    },
    {
      name: "IT Support (Beta)",
      coverage:
        "End-to-end IT help desk coverage (Tiers I–II), incident handling, and specialist pathways so users feel supported instead of stuck.",
      coverageEs:
        "Cobertura de mesa de ayuda de TI de punta a punta (niveles I–II), manejo de incidentes y rutas especializadas para que las personas usuarias se sientan acompañadas y no atrapadas."
    },
    {
      name: "Professionals On Demand",
      coverage:
        "Quickly deployable assistants, specialists, and consultants for projects, transitions, or ongoing support without committing to a full internal team from day one.",
      coverageEs:
        "Asistentes, especialistas y consultores que puedes desplegar rápido para proyectos, transiciones o soporte continuo sin comprometerte desde el inicio con un equipo interno completo."
    }
  ],
  proofPoints: [
    "24/7 follow-the-sun teams",
    "Faster resolution times compared to typical baselines",
    "High availability for remote operations",
    "Security posture strengthened through the OPS CyberSec Core framework"
  ],
  proofPointsEs: [
    "Equipos 24/7 con cobertura follow-the-sun",
    "Tiempos de resolución más rápidos que los promedios habituales",
    "Alta disponibilidad para operaciones remotas",
    "Postura de seguridad reforzada a través del marco OPS CyberSec Core"
  ],
  talentNetwork: {
    applicationHighlights: [
      "Professionals can showcase crafts, industries, skills, education, certifications, hobbies, continued education, achievements, and values.",
      "Primary tracks include Business Operations, Contact Center, IT Support, Professionals On Demand, and Analytics & Insights.",
      "Engagement models range from full-time pods to part-time retainers and project-based sprints."
    ],
    applicationHighlightsEs: [
      "Las personas postulantes pueden mostrar oficios, industrias, habilidades, educación, certificaciones, hobbies, formación continua, logros y valores.",
      "Las principales áreas incluyen Operaciones de Negocio, Contact Center, Soporte IT, Profesionales On Demand y Analytics & Insights.",
      "Los modelos de colaboración abarcan pods de tiempo completo, retainers de medio tiempo y sprints por proyecto."
    ],
    commitments: [
      "Inclusive, remote-first talent community",
      "Confidential intake with responses within one business day"
    ],
    commitmentsEs: [
      "Comunidad de talento inclusiva y 100 % remota",
      "Proceso de ingreso confidencial con respuesta en un día hábil"
    ]
  },
  contactPathways: [
    "Book a discovery call to map operational needs",
    "Talk directly with OPS about operations, integrations, or CX roadmaps",
    "Hire remote specialists across operations, CX, IT support, and on-demand talent"
  ],
  contactPathwaysEs: [
    "Agendar una discovery call para mapear necesidades operativas",
    "Hablar directamente con OPS sobre operaciones, integraciones o roadmaps de CX",
    "Contratar especialistas remotos en operaciones, CX, soporte IT y talento on-demand"
  ],
  contentMetrics: {
    homepageCharacters: 3625,
    chatbotPanelCharacters: 138,
    talentApplicationCharacters: 1935,
    contactPageCharacters: 833
  }
});

export function formatBulletedSection(title, lines) {
  return [`${title}:`, ...lines.map((line) => `- ${line}`)].join("\n");
}

export function buildServiceDirectoryPrompt(locale = "en") {
  const isEs = locale === "es";
  const t = (en, es) => (isEs ? es : en);

  const overview = SERVICE_DIRECTORY.overview;
  const focus = isEs ? overview.focusEs || overview.focus : overview.focus;

  const pillars = SERVICE_DIRECTORY.servicePillars.map(
    (pillar) =>
      `${pillar.name} – ${
        isEs ? pillar.summaryEs || pillar.summary : pillar.summary
      }`
  );

  const solutions = SERVICE_DIRECTORY.solutions.map(
    (solution) =>
      `${solution.name} – ${
        isEs ? solution.coverageEs || solution.coverage : solution.coverage
      }`
  );

  const proofPoints = isEs
    ? SERVICE_DIRECTORY.proofPointsEs || SERVICE_DIRECTORY.proofPoints
    : SERVICE_DIRECTORY.proofPoints;

  const talentHighlights = isEs
    ? SERVICE_DIRECTORY.talentNetwork.applicationHighlightsEs ||
      SERVICE_DIRECTORY.talentNetwork.applicationHighlights
    : SERVICE_DIRECTORY.talentNetwork.applicationHighlights;

  const commitments = isEs
    ? SERVICE_DIRECTORY.talentNetwork.commitmentsEs ||
      SERVICE_DIRECTORY.talentNetwork.commitments
    : SERVICE_DIRECTORY.talentNetwork.commitments;

  const contact = isEs
    ? SERVICE_DIRECTORY.contactPathwaysEs || SERVICE_DIRECTORY.contactPathways
    : SERVICE_DIRECTORY.contactPathways;

  return [
    t(
      "Use this summary of the OPS Remote Professional Network when answering questions about OPS services and talent.",
      "Usa este resumen de OPS Remote Professional Network al responder preguntas sobre servicios y talento de OPS."
    ),
    t(
      "When it makes sense, connect your recommendations back to the pillars or solutions that best fit the situation.",
      "Cuando tenga sentido, vincula tus recomendaciones con los pilares o soluciones que mejor encajen con la situación."
    ),
    t(
      "Answer in the person’s preferred language (English or Spanish) and keep the OPS product names as they are.",
      "Responde en el idioma preferido de la persona (inglés o español) y mantén los nombres de productos OPS tal como están."
    ),
    "",
    `${t("Overview", "Resumen")}: ${overview.name} — ${focus}`,
    formatBulletedSection(t("Service Pillars", "Pilares de Servicio"), pillars),
    formatBulletedSection(t("Solutions", "Soluciones"), solutions),
    formatBulletedSection(
      t("Operational Highlights", "Pruebas Operativas"),
      proofPoints
    ),
    formatBulletedSection(
      t("Talent Network Highlights", "Highlights de la Red de Talento"),
      talentHighlights
    ),
    formatBulletedSection(
      t("Community Commitments", "Compromisos con la Comunidad"),
      commitments
    ),
    formatBulletedSection(
      t("Contact & Hiring Pathways", "Rutas de Contacto y Contratación"),
      contact
    ),
    t("Content snapshot:", "Resumen de contenido:"),
    `${t("- Homepage characters", "- Caracteres de la página de inicio")}: ${
      SERVICE_DIRECTORY.contentMetrics.homepageCharacters
    }`,
    `${t(
      "- Chatbot panel characters",
      "- Caracteres del panel del chatbot"
    )}: ${SERVICE_DIRECTORY.contentMetrics.chatbotPanelCharacters}`,
    `${t(
      "- Talent application characters",
      "- Caracteres de la aplicación de talento"
    )}: ${SERVICE_DIRECTORY.contentMetrics.talentApplicationCharacters}`,
    `${t(
      "- Contact page characters",
      "- Caracteres de la página de contacto"
    )}: ${SERVICE_DIRECTORY.contentMetrics.contactPageCharacters}`
  ].join("\n");
}

export const SERVICE_DIRECTORY_PROMPTS = Object.freeze({
  en: buildServiceDirectoryPrompt("en"),
  es: buildServiceDirectoryPrompt("es")
});

export const SERVICE_DIRECTORY_PROMPT = SERVICE_DIRECTORY_PROMPTS.en;
