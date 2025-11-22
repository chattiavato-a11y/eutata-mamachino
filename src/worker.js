// src/worker.js — withered-mouse-9aee
// Integrity Gateway + Chat + STT + KB fallback + L7 escalation (pure JS, CF Workers Module)

import { debugStorage } from "./debug/storage.js";

/////////////////////// CONFIG ///////////////////////
const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_INTEGRITY_VALUE   = "https://chattiavato-a11y.github.io";
const DEFAULT_INTEGRITY_GATEWAY = "https://withered-mouse-9aee.grabem-holdem-nuts-right.workers.dev";
const DEFAULT_HIGH_CONFIDENCE_URL = "https://ops-chattia-api.grabem-holdem-nuts-right.workers.dev/";
const DEFAULT_INTEGRITY_PROTOCOLS = "CORS,CSP,OPS-CySec-Core,CISA,NIST,PCI-DSS,SHA-384,SHA-512";
const BASE_ALLOWED_ORIGINS = ["https://chattiavato-a11y.github.io"];
const DEFAULT_HONEYPOT_FIELDS = ["hp_email","hp_name","hp_field","honeypot","hp_text","botcheck","bot_field","trap_field","company"];
const HONEYPOT_BLOCK_TTL_SECONDS = 86400; // 24h
const SESSION_NONCE_PATTERN = /^[a-f0-9]{32}$/;
const CHANNELLA_HEADER = "X-OPS-Channella";        // request/response header carrying canonical channella key
const CHANNELLA_PUB_HEADER = "X-Channella-Pub";    // optional header (client may send base64url JWK thumbprint)
const DEFAULT_CHANNELLA_KEY = "ops-channella-v1";  // fallback if no JWK provided

/////////////////////// GOVERNANCE PROMPTS ///////////////////////
const SYSTEM_PROMPTS = {
  en:
    "You are Chattia, an empathetic, security-aware assistant. Be concise and actionable. " +
    "Explain step-by-step when useful. Call out cautions. Align with OPS Core CyberSec governance.",
  es:
    "Eres Chattia, una asistente empática y consciente de seguridad. Sé concisa y accionable. " +
    "Explica paso a paso cuando ayude. Señala precauciones. Alinea con el marco OPS Core CyberSec."
};
const LANGUAGE_PROMPTS = {
  en: "Respond in English unless the user clearly switches language.",
  es: "Responde en español salvo que la persona cambie claramente de idioma."
};
// Minimal directory prompt (inline; no imports)
const SERVICE_DIRECTORY_PROMPTS = {
  en:
    "OPS Remote Professional Network pillars: Business Operations, Contact Center, IT Support, Professionals On-Demand. " +
    "Tie relevant answers to these pillars when appropriate.",
  es:
    "Pilares de OPS Remote Professional Network: Operaciones de Negocio, Contact Center, Soporte TI, Profesionales On-Demand. " +
    "Vincula respuestas relevantes a estos pilares cuando corresponda."
};

// Guard messages (multi-lingual)
const WARNING_MESSAGES = {
  en: "Apologies, but I cannot execute that request, do you have any questions about our website?",
  es: "Disculpa, no puedo ejecutar esa solicitud. ¿Tienes preguntas sobre nuestro sitio?"
};
const TERMINATE_MESSAGES = {
  en: "Apologies, but I must not continue with this chat and I must end this session.",
  es: "Disculpa, no debo continuar con este chat y debo terminar la sesión."
};
const ALL_GUARD_MESSAGES = [
  WARNING_MESSAGES.en, WARNING_MESSAGES.es,
  TERMINATE_MESSAGES.en, TERMINATE_MESSAGES.es
];

// Simple threat heuristics
const MALICIOUS_PATTERNS = [/<[^>]*>/i,/script/i,/malicious/i,/attack/i,/ignore/i,/prompt/i,/hack/i,/drop\s+table/i];
const SECURITY_THREAT_PATTERNS = [
  /<script/i,/javascript:/i,/onerror\s*=|onload\s*=/i,/data:text\/html/i,/union\s+select/i,/drop\s+table/i,
  /xss|csrf|sql\s+injection|sniffing|spoofing|phishing|clon(e|ing)|malware/i
];
const SECURITY_ALERT_MESSAGES = Object.freeze({
  en: "Security sweep blocked suspicious instructions. Please restate your OPS request without code or exploits.",
  es: "El barrido de seguridad bloqueó instrucciones sospechosas. Reformula tu solicitud OPS sin código ni exploits."
});
const WEBSITE_KEYWORDS = ["website","site","chattia","product","service","support","order","account","pricing","contact","help"];

// Minimal website KB for local answers (BM25-ish)
const WEBSITE_KB = buildWebsiteKb();
const STOP_WORDS = {
  en: new Set("a,about,an,and,are,as,at,be,by,for,from,how,in,is,it,of,on,or,our,that,the,their,to,we,what,when,with,can".split(",")),
  es: new Set("a,al,como,con,de,del,el,ella,ellas,ellos,en,es,esta,este,las,los,para,por,que,se,son,su,sus,un,una,y,puede".split(","))
};
const AVG_DOC_LENGTH = WEBSITE_KB.reduce((s,d)=>s+d.content.split(/\s+/).length,0)/(WEBSITE_KB.length||1);

/////////////////////// ENTRY ///////////////////////
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // CORS preflight
    if ((url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/fallback/")) && method === "OPTIONS") {
      return applySecurityHeaders(new Response(null, { status: 204 }), request, env);
    }

    // Health
    if (url.pathname === "/health" || url.pathname === "/health/ok") {
      return applySecurityHeaders(json({ ok:true }), request, env);
    }
    if (url.pathname === "/health/summary") {
      return applySecurityHeaders(json({
        ok: true,
        signature_ttl: getSignatureTtl(env),
        gateway: resolveIntegrityGateway(env),
        protocols: resolveIntegrityProtocols(env),
        allowed_origins: buildAllowedOrigins(env),
        channella_key: await resolveChannellaCanonical(env) // exposes canonical so UI can mirror it
      }), request, env);
    }

    if (url.pathname === "/debug/storage") {
      const diagnostics = await debugStorage(env);
      return applySecurityHeaders(json(diagnostics), request, env);
    }

    // Non-API root
    if (url.pathname === "/" || (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/auth/") && !url.pathname.startsWith("/fallback/"))) {
      return applySecurityHeaders(new Response("OK", { status: 200 }), request, env);
    }

    // Detached signature mint
    if (url.pathname === "/auth/issue") {
      if (method !== "POST") return applySecurityHeaders(json({error:"method_not_allowed"},405), request, env);
      const out = await handleAuthIssue(request, env);
      return applySecurityHeaders(out, request, env);
    }

    // Chat
    if (url.pathname === "/api/chat") {
      if (method !== "POST") return applySecurityHeaders(json({error:"method_not_allowed"},405), request, env);
      const out = await handleChatRequest(request, env);
      return applySecurityHeaders(out, request, env);
    }

    // STT
    if (url.pathname === "/api/stt") {
      if (method !== "POST") return applySecurityHeaders(json({error:"method_not_allowed"},405), request, env);
      const out = await handleSttRequest(request, env);
      return applySecurityHeaders(out, request, env);
    }

    // Client-side fallback telemetry
    if (url.pathname === "/fallback/escalate") {
      if (method !== "POST") return applySecurityHeaders(json({ error:"method_not_allowed" },405), request, env);
      const gate = enforceIntegrityHeadersOnly(request, env);
      if (gate) return applySecurityHeaders(gate, request, env);
      try {
        const payload = await request.json();
        await forwardEscalation({
          ...payload,
          gateway: "ops-integrity-gateway",
          timestamp: payload?.timestamp || new Date().toISOString()
        }, env).catch(()=>{});
        return applySecurityHeaders(json({ escalated:true }), request, env);
      } catch {
        return applySecurityHeaders(json({ error:"Invalid JSON" },400), request, env);
      }
    }

    return applySecurityHeaders(json({error:"not_found"},404), request, env);
  }
};

/////////////////////// AUTH ///////////////////////
async function handleAuthIssue(request, env) {
  const headerGate = enforceIntegrityHeadersOnly(request, env);
  if (headerGate) return headerGate;
  if (!env.SHARED_KEY) return json({ error:"Signature service unavailable" }, 500);

  let payload;
  try { payload = await request.json(); } catch { return json({ error:"Invalid JSON" },400); }

  const tsRaw = payload?.ts ?? payload?.timestamp;
  const nonceRaw = payload?.nonce;
  const methodRaw = payload?.method;
  const pathRaw = payload?.path;
  const bodyShaRaw = payload?.body_sha256 ?? payload?.bodySha256;

  const ts = Number(tsRaw), now = Math.floor(Date.now()/1000), ttl = getSignatureTtl(env);
  if (!Number.isFinite(ts)) return json({ error:"Invalid timestamp" },400);
  if (ts > now + 5 || now - ts > ttl) return json({ error:"Timestamp out of range" },400);

  const nonce = typeof nonceRaw === "string" ? nonceRaw.trim().toLowerCase() : "";
  if (!SESSION_NONCE_PATTERN.test(nonce)) return json({ error:"Invalid nonce" },400);

  const method = typeof methodRaw === "string" ? methodRaw.trim().toUpperCase() : "";
  if (method !== "POST") return json({ error:"Unsupported method" },400);

  const path = typeof pathRaw === "string" ? pathRaw.trim() : "";
  if (!path.startsWith("/api/")) return json({ error:"Invalid path" },400);

  const bodySha = typeof bodyShaRaw === "string" ? bodyShaRaw.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(bodySha)) return json({ error:"Invalid body digest" },400);

  if (env.OPS_NONCE_KV) {
    const mintKey = `mint:${nonce}:${ts}`;
    const exists = await env.OPS_NONCE_KV.get(mintKey);
    if (exists) return json({ error:"Nonce reuse detected" },409);
    await env.OPS_NONCE_KV.put(mintKey, "1", { expirationTtl: ttl });
  }

  const canonical = `${ts}.${nonce}.${method}.${path}.${bodySha}`;
  // SHARED_KEY is base64; hmacSha512B64 will decode it and return base64 signature
  const signature = await hmacSha512B64(env.SHARED_KEY, canonical);
  const remaining = Math.max(0, ttl - Math.max(0, now - ts));
  return new Response(JSON.stringify({ signature, expires_in: remaining }), {
    status: 200,
    headers: { "content-type":"application/json; charset=UTF-8","cache-control":"no-store","x-signature-ttl":String(ttl) }
  });
}

/////////////////////// CHAT ///////////////////////
async function handleChatRequest(request, env) {
  const honeypotBan = await checkHoneypotBan(request, env);
  if (honeypotBan?.blocked) return honeypotBlockedResponse(honeypotBan.reason, honeypotBan.until);

  const gate = await enforceIntegrity(request, env, "/api/chat");
  if (gate) return gate;

  try {
    const body = await request.json();

    const hp = detectHoneypotInObject(body, env);
    if (hp) {
      await registerHoneypotBan(request, env, hp);
      return honeypotBlockedResponse(hp.reason);
    }

    const turnToken = extractTurnstileToken(body);
    const turnGate = await enforceTurnstile(turnToken, request, env);
    if (turnGate) return turnGate;

    const rawMetadata = body && typeof body === "object" ? body.metadata : undefined;
    const metadata = (rawMetadata && typeof rawMetadata === "object") ? { ...rawMetadata } : {};
    body.metadata = metadata;

    const { messages = [] } = body;
    const normalized = Array.isArray(messages)
      ? messages.filter(m => m && typeof m.content === "string" && m.content.trim())
      : [];

    // Policy sweep
    const pol = evaluatePolicy(normalized);
    if (pol.blocked) return await buildGuardedResponse(pol.reply, env);

    // Sanitize + prompts
    const sanitized = normalized.map(m => m.role === "user" ? ({ ...m, content: sanitizeText(m.content) }) : m);
    const preferredLocale = detectPreferredLocale(sanitized, metadata);
    if (!metadata.locale) metadata.locale = preferredLocale;
    const preparedMessages = ensureGovernancePrompts(sanitized, metadata.locale);

    // Quick KB path
    const lastUser = [...sanitized].reverse().find(m => m.role === "user")?.content || "";
    const kb = routeWebsiteDefaultFlow(lastUser);
    if (kb) return await buildKnowledgeResponse(kb, env, metadata.locale);

    // Primary model
    let model = selectChatModel(env, metadata);
    let ai = await env.AI.run(model, { messages: preparedMessages, max_tokens: getMaxTokens(env), temperature: 0.3, metadata });

    let reply =
      (typeof ai === "string" && ai) ||
      ai?.response || ai?.result || ai?.output_text ||
      getDefaultReply(metadata.locale);

    let trimmed = String(reply).trim();
    let conf = assessConfidence(trimmed, ai);
    let escalated = Boolean(metadata?.escalated);

    // Escalate on low confidence
    if (conf.level === "low" && !escalated) {
      const bump = await escalateHighConfidenceChat({ body, sanitizedMessages: preparedMessages, request, env });
      if (bump?.reply) {
        reply = bump.reply;
        trimmed = String(reply).trim();
        conf = { level:"high", reasons:["escalated"] };
        ai = bump.aiResponse ?? ai;
        model = bump.model ?? model;
        escalated = true;
      }
    }

    const digest = await sha512B64(trimmed);
    const gw = resolveIntegrityGateway(env);
    const protos = resolveIntegrityProtocols(env);

    return new Response(JSON.stringify({
      reply: trimmed,
      model,
      usage: ai?.usage ?? null,
      confidence: conf.level,
      confidence_reasons: conf.reasons,
      escalated
    }), {
      status: 200,
      headers: {
        "content-type":"application/json; charset=UTF-8",
        "cache-control":"no-store",
        "x-model": model,
        "x-reply-digest-sha512": digest,
        "x-integrity-gateway": gw,
        "x-integrity-protocols": protos,
        "x-confidence-level": conf.level,
        "x-confidence-reasons": Array.isArray(conf.reasons)?conf.reasons.join(","):""
      }
    });

  } catch {
    return json({ error:"Failed to process request" },500);
  }
}

/////////////////////// STT ///////////////////////
async function handleSttRequest(request, env) {
  const honeypotBan = await checkHoneypotBan(request, env);
  if (honeypotBan?.blocked) return honeypotBlockedResponse(honeypotBan.reason, honeypotBan.until);

  const gate = await enforceIntegrity(request, env, "/api/stt");
  if (gate) return gate;

  try {
    const ct = (request.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("multipart/form-data")) return json({ error:"Expected multipart/form-data" },400);

    const form = await request.formData();

    const hp = detectHoneypotInForm(form, env);
    if (hp) {
      await registerHoneypotBan(request, env, hp);
      return honeypotBlockedResponse(hp.reason);
    }

    const token = extractTurnstileToken(form);
    const turnGate = await enforceTurnstile(token, request, env);
    if (turnGate) return turnGate;

    const audio = form.get("audio");
    if (!(audio instanceof File)) return json({ error:"Audio blob missing" },400);

    const maxBytes = clampInt(env.MAX_AUDIO_BYTES, 8_000_000);
    if (audio.size > maxBytes) return json({ error:"Audio payload exceeds limit" },413);

    const buf = await audio.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const locale = sanitizeLocale(String(form.get("lang") || ""));
    const prefer = String(form.get("prefer") || "").trim().toLowerCase();
    const model = selectSttModel(env, prefer);

    const aiResponse = await env.AI.run(model, { audio: [...bytes], language: locale });
    const transcript = extractTranscript(aiResponse);
    const clean = sanitizeText(transcript);
    const transcriptDigest = await sha512B64(clean);
    const gw = resolveIntegrityGateway(env);
    const protos = resolveIntegrityProtocols(env);

    return new Response(JSON.stringify({ text: clean }), {
      status: 200,
      headers: {
        "content-type":"application/json; charset=UTF-8",
        "cache-control":"no-store",
        "x-tier": aiResponse?.tier || "?",
        "x-model": model,
        "x-transcript-digest-sha512": transcriptDigest,
        "x-integrity-gateway": gw,
        "x-integrity-protocols": protos
      }
    });

  } catch {
    return json({ error:"Failed to transcribe audio" },500);
  }
}

/////////////////////// L7 ESCALATION ///////////////////////
async function escalateHighConfidenceChat({ body, sanitizedMessages, request, env }) {
  const base = resolveHighConfidenceUrl(env);
  if (!base) return null;
  let target; try { target = new URL("/api/chat", base).toString(); } catch { return null; }

  const metadata = { ...(body?.metadata||{}), escalated:true, tier: body?.metadata?.tier || "premium" };
  const payload = { messages: sanitizedMessages, metadata };

  const headers = new Headers({ "content-type":"application/json" });
  for (const k of ["x-integrity","x-integrity-gateway","x-integrity-protocols","x-request-signature","x-request-timestamp","x-request-nonce",CHANNELLA_HEADER,"x-integrity-key",CHANNELLA_PUB_HEADER]) {
    const v = request.headers.get(k); if (v) headers.set(k, v);
  }

  // NOTE: if you want HMAC between Workers, you can do:
  // const bodyText = JSON.stringify(payload);
  // const detachedHex = await signBodyWithHmac(env, bodyText);
  // headers.set("X-Signature-HMAC-SHA512", detachedHex);

  try {
    const res = await fetch(target, { method:"POST", headers, body: JSON.stringify(payload) });
    if (!res.ok) return null;
    const data = await res.json();
    const reply =
      (typeof data === "string" && data) ||
      data?.reply || data?.response || data?.result || data?.output_text;
    if (!reply) return null;

    return { reply, aiResponse: { response: reply, usage: data?.usage ?? null }, model: data?.model || data?.x_model || "escalated" };
  } catch { return null; }
}

async function forwardEscalation(payload, env) {
  const hook = (env.ESCALATION_WEBHOOK || "").trim();
  if (!hook) return;
  try { await fetch(hook, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(payload) }); } catch {}
}

/////////////////////// POLICY + KB ///////////////////////
function sanitizeText(s){
  if (!s) return "";
  return String(s)
    .replace(/<[^>]*>/g," ")
    .replace(/javascript:/gi,"")
    .replace(/data:text\/html[^\s]*/gi,"")
    .replace(/on\w+\s*=/gi," ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g,"")
    .replace(/\s+/g," ")
    .trim();
}
function evaluatePolicy(messages){
  if (!Array.isArray(messages)||!messages.length) return {blocked:false};
  const users = messages.filter(m=>m.role==="user");
  if (!users.length) return {blocked:false};
  const last = sanitizeText(users[users.length-1].content);
  if (!last) return {blocked:false};

  const lower = last.toLowerCase();
  const looksBad = MALICIOUS_PATTERNS.some(rx=>rx.test(lower));
  const onTopic  = WEBSITE_KEYWORDS.some(k=>lower.includes(k));
  if (!looksBad && onTopic) return {blocked:false};

  const lang = detectLanguage(last);
  const warning  = WARNING_MESSAGES[lang]  || WARNING_MESSAGES.en;
  const terminate= TERMINATE_MESSAGES[lang]|| TERMINATE_MESSAGES.en;

  const guardCount = messages.filter(m=>m.role==="assistant" && ALL_GUARD_MESSAGES.some(msg => m.content.includes(msg))).length;
  if (guardCount>=1) return {blocked:true, reply:terminate};
  return {blocked:true, reply:warning};
}

function tokenize(s){ return s.toLowerCase().split(/[^a-záéíóúñü0-9]+/).filter(Boolean); }
function detectLanguage(s){
  if (!s) return "en";
  if (/[áéíóúñü¿¡]/i.test(s)) return "es";
  const lower = s.toLowerCase();
  const esHints = /(hola|buen[oa]s|gracias|por favor|necesito|operaciones|contacto|contratar|soporte|centro|llamar|consulta|ayuda|descubrimiento)/i.test(lower);
  const enHints = /(hello|hi|please|thanks|support|contact|pricing|order|help|operations|book)/i.test(lower);
  if (esHints && !enHints) return "es";
  return "en";
}
function computeIdf(term){
  const N = WEBSITE_KB.length || 1;
  const df = WEBSITE_KB.reduce((c,d)=>c + (d.content.toLowerCase().includes(term)?1:0),0) || 1;
  return Math.log((N - df + 0.5) / (df + 0.5) + 1);
}
function scoreDocumentBm25(doc, terms){
  const k1=1.2, b=0.75;
  const docLen = doc.content.split(/\s+/).length || 1;
  let score=0;
  for (const t of terms){
    const tf = (doc.content.toLowerCase().match(new RegExp(`\\b${escapeReg(t)}\\b`,"g"))||[]).length;
    if (!tf) continue;
    const idf = computeIdf(t);
    score += idf * (tf*(k1+1)) / (tf + k1*(1 - b + b*(docLen/(AVG_DOC_LENGTH||1))));
  }
  return score;
}
function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

function routeWebsiteDefaultFlow(usr){
  const q = sanitizeText(usr||""); if (!q) return null;
  const lang = detectLanguage(q);
  const terms = tokenize(q).filter(t=>!STOP_WORDS[lang]?.has(t));
  if (!terms.length) return null;

  let cands = WEBSITE_KB.filter(d=>d.lang===lang);
  if (!cands.length) cands = WEBSITE_KB;

  let best=null;
  for (const d of cands){
    const s = scoreDocumentBm25(d, terms);
    if (!best || s>best.score) best={doc:d,score:s};
  }
  if (!best || best.score < 1.15) return null;

  let reply = (lang==="es" ? best.doc.summaryEs : best.doc.summaryEn) || best.doc.content;
  return { type:"kb", reply, docId:best.doc.id, title:best.doc.title, language:lang, score:best.score };
}

async function buildKnowledgeResponse(kb, env, locale){
  const reply = (kb?.reply || "").trim();
  const digest = await sha512B64(reply);
  const gw = resolveIntegrityGateway(env);
  const protos = resolveIntegrityProtocols(env);
  return new Response(JSON.stringify({
    reply,
    model: "kb",
    knowledge_id: kb?.docId || null,
    confidence: "high",
    confidence_reasons: ["website_kb"],
    escalated: false,
    language: (locale==="es" || kb?.language==="es") ? "es" : "en"
  }), {
    status:200,
    headers:{
      "content-type":"application/json; charset=UTF-8",
      "cache-control":"no-store",
      "x-model":"kb",
      "x-reply-digest-sha512": digest,
      "x-knowledge-id": kb?.docId || "",
      "x-integrity-gateway": gw,
      "x-integrity-protocols": protos,
      "x-confidence-level":"high",
      "x-confidence-reasons":"website_kb"
    }
  });
}

async function buildGuardedResponse(message, env){
  const reply = (message || WARNING_MESSAGES.en).trim();
  const digest = await sha512B64(reply);
  const gw = resolveIntegrityGateway(env);
  const protos = resolveIntegrityProtocols(env);
  return new Response(JSON.stringify({
    reply,
    model: "policy",
    usage: null,
    confidence: "low",
    confidence_reasons: ["policy_guard"],
    escalated: false
  }), {
    status:200,
    headers:{
      "content-type":"application/json; charset=UTF-8",
      "cache-control":"no-store",
      "x-model":"policy",
      "x-reply-digest-sha512": digest,
      "x-integrity-gateway": gw,
      "x-integrity-protocols": protos,
      "x-confidence-level":"low",
      "x-confidence-reasons":"policy_guard"
    }
  });
}

function ensureGovernancePrompts(messages, locale){
  const directoryPrompt = getDirectoryPrompt(locale);
  const systemPrompt = getSystemPrompt(locale);
  const languagePrompt = getLanguagePrompt(locale);
  const known = new Set([directoryPrompt.trim(), systemPrompt.trim(), languagePrompt.trim()]);
  const filtered = [];
  for (const msg of messages || []){
    if (msg?.role === "system"){
      const content = (msg.content||"").trim();
      if (known.has(content)) continue;
    }
    filtered.push(msg);
  }
  return [
    {role:"system", content: directoryPrompt},
    {role:"system", content: systemPrompt},
    {role:"system", content: languagePrompt},
    ...filtered
  ];
}
function getSystemPrompt(locale){ return SYSTEM_PROMPTS[locale==="es"?"es":"en"]; }
function getDirectoryPrompt(locale){ return SERVICE_DIRECTORY_PROMPTS[locale==="es"?"es":"en"] || SERVICE_DIRECTORY_PROMPTS.en; }
function getLanguagePrompt(locale){ return LANGUAGE_PROMPTS[locale==="es"?"es":"en"]; }
function detectPreferredLocale(messages, metadata){
  const localeHint = metadata?.locale || metadata?.lang || metadata?.language;
  const sanitized = sanitizeLocale(localeHint || "");
  if (sanitized.startsWith("es")) return "es";
  if (sanitized.startsWith("en")) return "en";
  const lastUser = [...(messages||[])].reverse().find(m => m && m.role === "user" && m.content);
  if (lastUser) {
    const guess = detectLanguage(lastUser.content);
    if (guess === "es") return "es";
  }
  return "en";
}
function getDefaultReply(locale){
  return (locale==="es")
    ? "¿En qué puedo ayudarte con OPS hoy?"
    : "How can I help you with OPS today?";
}

function buildWebsiteKb(){
  const docs = [
    {
      id: "ops-hero",
      lang: "en",
      title: "OPS Website — Hero",
      content: "Ops Online Support helps teams keep momentum by handling operations so you can focus on growth.",
      summaryEn: "Ops Online Support keeps you moving by handling operations so your team can focus on growth.",
      summaryEs: "Ops Online Support mantiene tu impulso gestionando operaciones para que tu equipo se enfoque en crecer."
    },
    {
      id: "ops-pillars",
      lang: "en",
      title: "Service pillars",
      content: "Service pillars: Business Operations, Contact Center, IT Support, Professionals On-Demand.",
      summaryEn: "Our pillars: Business Operations, Contact Center, IT Support, and Professionals On-Demand.",
      summaryEs: "Nuestros pilares: Operaciones de Negocio, Contact Center, Soporte TI y Profesionales On-Demand."
    }
  ];
  return docs;
}

/////////////////////// CONFIDENCE ///////////////////////
function assessConfidence(reply, ai){
  const t = (reply||"").trim();
  if (!t) return {level:"low", reasons:["empty"]};
  const lower = t.toLowerCase();
  const uncertain = /(i\s+(am|'m)\s+(not\s+)?sure|i\s+(do\s+not|don't)\s+know|unable to|cannot|can't|no\s+estoy\s+segur[ao]|no\s+sé|no\s+puedo)/i.test(lower);
  const refusal   = /(i\s*am\s*sorry|i'm\s*sorry|cannot\s+comply|unable\s+to\s+assist|lo\s+siento|no\s+puedo\s+cumplir)/i.test(lower);
  const informative = /(business operations|operaciones de negocio|contact center|centro de contacto|it support|soporte ti|professionals|profesionales)/i.test(lower);
  const len = t.length;
  const tokens = Number(ai?.usage?.total_tokens ?? ai?.usage?.totalTokens ?? 0);

  // Default as low confidence unless replies are significantly detailed and on-topic.
  if (uncertain || refusal) return {level:"low", reasons:["uncertain_tone"]};
  if (len < 180 || tokens < 300) return {level:"low", reasons:["brief"]};
  if (informative && len >= 240) return {level:"high", reasons:["rich_service_context"]};
  return {level:"medium", reasons:["default"]};
}

/////////////////////// SECURITY (CORS/Integrity) ///////////////////////
function applySecurityHeaders(resp, req, env){
  const h = new Headers(resp.headers);

  const origin = req.headers.get("Origin");
  const allow = getAllowedOrigin(origin, env);
  if (allow){
    h.set("Access-Control-Allow-Origin", allow);
    h.set("Access-Control-Allow-Credentials","true");
    h.set("Vary", mergeVary(h.get("Vary"), "Origin"));
  }

  h.set("Access-Control-Allow-Methods","POST, OPTIONS");
  h.set("Access-Control-Allow-Headers",
    "Content-Type, X-Integrity, X-Integrity-Gateway, X-Integrity-Protocols, X-Request-Signature, X-Request-Timestamp, X-Request-Nonce, X-OPS-Signature, X-OPS-Timestamp, X-OPS-Nonce, CF-Turnstile-Response, X-Turnstile-Token, X-OPS-Channella, X-Integrity-Key, X-Channella-Pub"
  );
  h.set("Access-Control-Max-Age","600");

  h.set("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'; base-uri 'none';");
  h.set("X-Content-Type-Options","nosniff");
  h.set("X-Frame-Options","DENY");
  h.set("Referrer-Policy","same-origin");
  h.set("Permissions-Policy","microphone=(),camera=(),geolocation=()");
  h.set("Strict-Transport-Security","max-age=63072000; includeSubDomains; preload");

  const gw = resolveIntegrityGateway(env);
  const protos = resolveIntegrityProtocols(env);
  const integrityValue = resolveIntegrityValue(env);

  // Derive CHANNELLA canonical each response (mirrors what we expect on requests)
  Promise.resolve(resolveChannellaCanonical(env)).then(canon => {
    h.set("X-Integrity", integrityValue);
    h.set("Integrity", integrityValue);
    h.set("X-Integrity-Gateway", gw);
    h.set("X-Integrity-Protocols", protos);
    h.set("X-OPS-CYSEC-CORE","active");
    h.set("X-Compliance-Frameworks", protos);
    h.set("X-Integrity-Key", canon);
    h.set(CHANNELLA_HEADER, canon);
  }).catch(()=>{});

  const sessionNonce = (req.headers.get("x-session-nonce")||"").trim();
  if (sessionNonce) h.set("X-Session-Nonce", sessionNonce);

  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

function resolveIntegrityGateway(env){ const c=(env.INTEGRITY_GATEWAY||"").trim(); return c || DEFAULT_INTEGRITY_GATEWAY; }
function resolveIntegrityProtocols(env){ const c=(env.INTEGRITY_PROTOCOLS||"").trim(); return c || DEFAULT_INTEGRITY_PROTOCOLS; }
function resolveIntegrityValue(env){ const c=(env.INTEGRITY_VALUE||env.INTEGRITY_TOKEN||"").trim(); return c || DEFAULT_INTEGRITY_VALUE; }
function resolveHighConfidenceUrl(env){
  const c = (env.HIGH_CONFIDENCE_URL || env.HIGH_CONFIDENCE_GATEWAY || env.HIGH_CONFIDENCE_ENDPOINT || "").trim();
  return c || DEFAULT_HIGH_CONFIDENCE_URL;
}

async function resolveChannellaCanonical(env){
  if (!env.CHANNELLA) {
    // Secret missing → do not block requests here; we’ll still compute a canonical for clients.
  }
  const pubRaw = (env.CHANNELLA_EXPECTED_PUB || "").trim();
  if (pubRaw) {
    try {
      const jwk = JSON.parse(pubRaw);
      const kid = await rfc7638ThumbprintB64url(jwk);
      return `ops-channella:${kid}`;
    } catch {
      // malformed JWK → fall through to fallback
    }
  }
  const configured = (env.CHANNELLA_CANONICAL || env.CHANNELLA_KEY || env.CHANNELLA || "").trim();
  if (configured) return configured;
  const derived = resolveIntegrityGateway(env).replace(/^https?:\/\//i, "").replace(/[^a-z0-9]+/gi,"-").replace(/(^-|-$)/g,"");
  return derived ? `ops-channella:${derived}` : DEFAULT_CHANNELLA_KEY;
}

function getAllowedOrigin(origin, env){
  if (!origin) return null;
  const norm = origin.trim().toLowerCase();
  if (!norm) return null;

  const allowWorkers = env.ALLOW_WORKERS_DEV==="true";
  const allowDash    = env.ALLOW_DASH==="true";

  const list = buildAllowedOrigins(env);
  if (list.includes(norm)) return list[list.indexOf(norm)];

  if (allowWorkers && isWorkersDev(norm)) return origin;
  if (allowDash    && isDash(norm))       return origin;
  return null;
}
function buildAllowedOrigins(env){
  const gw = resolveIntegrityGateway(env).toLowerCase();
  const set = new Set(BASE_ALLOWED_ORIGINS.map(s=>s.toLowerCase()));
  set.add(gw);
  const conf = (env.INTEGRITY_GATEWAY||"").trim().toLowerCase();
  if (conf) set.add(conf);
  return Array.from(set);
}
function isWorkersDev(o){ try { return new URL(o).hostname.endsWith(".workers.dev"); } catch { return false; } }
function isDash(o){       try { return new URL(o).hostname.endsWith(".dash.cloudflare.com"); } catch { return false; } }
function mergeVary(ex,v){ if(!ex) return v; const S=new Set(ex.split(",").map(s=>s.trim()).filter(Boolean)); S.add(v); return Array.from(S).join(", "); }

function enforceIntegrityHeadersOnly(request, env){
  const headers = request.headers;
  const fail = (error, code=403) => json({ error }, code, { "cache-control":"no-store" });

  // 1) basic trio
  const integrity = (headers.get("x-integrity") || "").trim();
  if (!integrity) return fail("missing_integrity_header");
  if (integrity !== resolveIntegrityValue(env)) return fail("invalid_integrity_value");

  const gwHeader = (headers.get("x-integrity-gateway") || "").trim();
  if (!gwHeader) return fail("missing_integrity_gateway");
  if (normalizeUrlish(gwHeader) !== normalizeUrlish(resolveIntegrityGateway(env))) return fail("invalid_integrity_gateway");

  const protoHeader = (headers.get("x-integrity-protocols") || "").trim();
  if (!protoHeader) return fail("missing_integrity_protocols");
  if (normalizeProtocols(protoHeader) !== normalizeProtocols(resolveIntegrityProtocols(env))) return fail("invalid_integrity_protocols");

  // 2) CHANNELLA header presence (deep check happens in enforceIntegrity)
  const chHeader = (headers.get("x-integrity-key") || headers.get(CHANNELLA_HEADER) || "").trim();
  if (!chHeader) return fail("missing_channella");

  return null;
}
function normalizeUrlish(v){
  return (v||"").trim().replace(/\/+$/,"" ).toLowerCase();
}
function normalizeProtocols(v){ return (v||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean).join(","); }

async function enforceIntegrity(request, env, expectedPath){
  const headErr = enforceIntegrityHeadersOnly(request, env);
  if (headErr) return headErr;

  // Deep CHANNELLA check (compare header vs computed canonical)
  const sentKey = (request.headers.get("x-integrity-key") || request.headers.get(CHANNELLA_HEADER) || "").trim();
  const canonical = await resolveChannellaCanonical(env);
  if (sentKey !== canonical) return json({ error:"invalid_channella" },403,{"cache-control":"no-store"});

  if (!env.CHANNELLA) {
    return json({ error:"channella_secret_missing" },503,{"cache-control":"no-store"});
  }

  if (!env.SHARED_KEY) return json({ error:"integrity_service_unavailable" },503,{"cache-control":"no-store"});

  const signature = (request.headers.get("x-request-signature") || "").trim();
  const tsHeader = request.headers.get("x-request-timestamp");
  const nonce = (request.headers.get("x-request-nonce") || "").trim().toLowerCase();
  if (!signature) return json({ error:"missing_signature" },403,{"cache-control":"no-store"});
  if (!tsHeader)  return json({ error:"missing_signature_timestamp" },403,{"cache-control":"no-store"});
  if (!nonce || !SESSION_NONCE_PATTERN.test(nonce)) return json({ error:"invalid_signature_nonce" },403,{"cache-control":"no-store"});

  const ts = Number(tsHeader);
  const now = Math.floor(Date.now()/1000);
  const ttl = getSignatureTtl(env);
  if (!Number.isFinite(ts)) return json({ error:"invalid_signature_timestamp" },403,{"cache-control":"no-store"});
  if (ts > now + 5 || now - ts > ttl) return json({ error:"signature_expired" },403,{"cache-control":"no-store","x-sig-ttl":String(ttl)});

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname;
  if (expectedPath && path !== expectedPath) return json({ error:"signature_path_mismatch" },403,{"cache-control":"no-store"});

  const bodySha = await sha256HexOfRequest(request.clone());
  const canonicalSig = `${ts}.${nonce}.${method}.${path}.${bodySha}`;

  // SHARED_KEY is base64; hmacSha512B64 will decode it and return base64 signature
  const expectedSig = await hmacSha512B64(env.SHARED_KEY, canonicalSig);
  if (!timingSafeEqual(signature, expectedSig)) return json({ error:"invalid_signature" },403,{"cache-control":"no-store"});

  if (env.OPS_NONCE_KV) {
    const cacheKey = `use:${nonce}:${ts}`;
    const seen = await env.OPS_NONCE_KV.get(cacheKey);
    if (seen) return json({ error:"signature_replay" },409,{"cache-control":"no-store"});
    await env.OPS_NONCE_KV.put(cacheKey, "1", { expirationTtl: ttl });
  }
  return null;
}

function timingSafeEqual(a,b){
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i=0;i<a.length;i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/////////////////////// HONEYPOT ///////////////////////
async function checkHoneypotBan(request, env){
  const kv = env.OPS_BANLIST_KV || env.OPS_NONCE_KV;
  if (!kv) return null;
  const ip = getClientIp(request); if (!ip) return null;
  const key = `honeypot:block:${ip}`;
  const raw = await kv.get(key); if (!raw) return null;
  let p; try { p=JSON.parse(raw); } catch { p={reason:String(raw||"honeypot"), expiresAt:null}; }
  return { blocked:true, reason:p?.reason||"honeypot", until:p?.expiresAt||null };
}
async function registerHoneypotBan(request, env, detail){
  const kv = env.OPS_BANLIST_KV || env.OPS_NONCE_KV;
  const ip = getClientIp(request);
  const ttl = getHoneypotBlockTtl(env);
  const reason = detail?.reason || `honeypot:${detail?.field||"unknown"}`;
  if (kv && ip){
    const key = `honeypot:block:${ip}`;
    const now = Date.now();
    const expiresAt = now + ttl*1000;
    const payload = JSON.stringify({reason, createdAt:now, expiresAt, field:detail?.field||null, snippet:detail?.snippet||null});
    await kv.put(key, payload, {expirationTtl:ttl});
  }
  return reason;
}
function honeypotBlockedResponse(reason, until){
  const payload = { error:"access_denied", reason: reason||"honeypot" };
  if (until) payload.blocked_until = until;
  return json(payload,403,{"cache-control":"no-store","x-honeypot":"blocked","x-block-reason":reason||"honeypot"});
}
function detectHoneypotInObject(obj, env){
  if (!obj || typeof obj!=="object") return null;
  const fields = getHoneypotFieldNames(env);
  const stack=[obj], seen=new Set();
  while(stack.length){
    const cur = stack.pop();
    if (!cur || typeof cur!=="object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const entries = Array.isArray(cur) ? cur.entries() : Object.entries(cur);
    for (const [kRaw,v] of entries){
      const k = typeof kRaw==="string"?kRaw:String(kRaw);
      const low = k.toLowerCase();
      if (isHoneypotFieldName(low, fields) && isFilledHoneypotValue(v)) {
        return createHoneypotDetail(k, v);
      }
      if (shouldTraverse(v)) stack.push(v);
    }
  }
  return null;
}
function detectHoneypotInForm(form, env){
  const fields = getHoneypotFieldNames(env);
  for (const name of form.keys()){
    const low = String(name).toLowerCase();
    if (!isHoneypotFieldName(low, fields)) continue;
    const vals = form.getAll(name)||[];
    for (const val of vals){
      if (typeof val==="string" && val.trim()) return createHoneypotDetail(name, val);
    }
  }
  return null;
}
function createHoneypotDetail(field, value){
  const snippet = typeof value==="string" ? value.trim().slice(0,64)
                : Array.isArray(value) ? value.map(v=>String(v)).join(", ").slice(0,64)
                : typeof value==="object" ? JSON.stringify(value).slice(0,64)
                : String(value);
  return { field, reason:`honeypot:${String(field).toLowerCase()}`, snippet };
}
function isFilledHoneypotValue(v){
  if (typeof v==="string") return v.trim().length>0;
  if (typeof v==="number") return !Number.isNaN(v) && v!==0;
  if (Array.isArray(v)) return v.some(x=>isFilledHoneypotValue(x));
  if (shouldTraverse(v)) return Object.values(v).some(x=>isFilledHoneypotValue(x));
  return false;
}
function getHoneypotFieldNames(env){
  const extra = (env?.HONEYPOT_FIELDS||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set([...DEFAULT_HONEYPOT_FIELDS, ...extra]));
}
function isHoneypotFieldName(name, allow){ if(!name) return false; return allow.includes(name)||name.includes("honeypot")||name.includes("bot")||name.includes("trap"); }
function shouldTraverse(v){
  if (!v) return false;
  if (Array.isArray(v)) return true;
  if (typeof v!=="object") return false;
  if (typeof File!=="undefined" && v instanceof File) return false;
  if (typeof Blob!=="undefined" && v instanceof Blob) return false;
  if (v instanceof ArrayBuffer) return false;
  if (ArrayBuffer.isView && ArrayBuffer.isView(v)) return false;
  const tag = Object.prototype.toString.call(v);
  return tag==="[object Object]" || tag==="[object Array]";
}
function getHoneypotBlockTtl(env){
  const raw = env?.HONEYPOT_BLOCK_TTL;
  const n = Number(raw);
  if (!Number.isFinite(n)||n<=0) return HONEYPOT_BLOCK_TTL_SECONDS;
  return Math.max(300, Math.min(604800, Math.floor(n)));
}
function getClientIp(req){
  const h = req.headers;
  return (h.get("cf-connecting-ip")||"").trim() ||
         (h.get("x-forwarded-for")||"").split(",").map(s=>s.trim()).find(Boolean) ||
         (h.get("x-real-ip")||"").trim() || null;
}

/////////////////////// TURNSTILE ///////////////////////
function extractTurnstileToken(source){
  const keys = ["cf-turnstile-response","turnstile_response","turnstile-token","turnstile_token","turnstileResponse","turnstileToken","turnstile"];
  if (!source) return null;
  if (typeof FormData!=="undefined" && source instanceof FormData){
    for (const k of keys){ const v = source.get(k); if (typeof v==="string" && v.trim()) return v.trim(); }
    return null;
  }
  if (typeof source==="object"){
    for (const k of keys){ const v = source[k]; if (typeof v==="string" && v.trim()) return v.trim(); }
    if (source.metadata && typeof source.metadata==="object") return extractTurnstileToken(source.metadata);
  }
  return null;
}
async function enforceTurnstile(token, request, env){
  const secret = (env?.TURNSTILE_SECRET||"").trim();
  if (!secret) return null; // disabled unless configured
  let resolved = typeof token==="string" ? token.trim() : "";
  if (!resolved){
    const h = request.headers.get("cf-turnstile-response") || request.headers.get("x-turnstile-token");
    if (h) resolved = h.trim();
  }
  if (!resolved) return json({error:"turnstile_required"},403,{"cache-control":"no-store","x-turnstile":"missing"});

  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", resolved);
  const ip = getClientIp(request); if (ip) params.set("remoteip", ip);

  try {
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method:"POST", body: params, headers: {"content-type":"application/x-www-form-urlencoded"}
    });
    if (!verify.ok) return json({error:"turnstile_unreachable"},502,{"cache-control":"no-store","x-turnstile":String(verify.status)});
    const result = await verify.json();
    if (!result?.success){
      const codes = Array.isArray(result?.["error-codes"]) ? result["error-codes"].join(",") : "failed";
      return json({error:"turnstile_failed", code: codes},403,{"cache-control":"no-store","x-turnstile":codes||"failed"});
    }
    return null;
  } catch {
    return json({error:"turnstile_error"},500,{"cache-control":"no-store","x-turnstile":"exception"});
  }
}

/////////////////////// MODELS / LIMITS ///////////////////////
function selectChatModel(env, metadata){
  const tier = typeof metadata?.tier === "string" ? metadata.tier.toLowerCase() : "";
  if (tier==="big"     && env.AI_LLM_BIG)     return env.AI_LLM_BIG;
  if (tier==="premium" && env.AI_LLM_PREMIUM) return env.AI_LLM_PREMIUM;
  return env.AI_LLM_DEFAULT || MODEL_ID;
}
function selectSttModel(env, prefer){
  const fallback = env.AI_STT_TURBO || env.AI_STT_BASE || env.AI_STT_TINY || env.AI_STT_VENDOR || "@cf/openai/whisper";
  switch (prefer) {
    case "tiny":   return env.AI_STT_TINY   || fallback;
    case "base":   return env.AI_STT_BASE   || fallback;
    case "turbo":  return env.AI_STT_TURBO  || fallback;
    case "vendor": return env.AI_STT_VENDOR || fallback;
    default:       return fallback;
  }
}
function getSignatureTtl(env){
  const fallback = 300;
  const v = env.SIG_TTL_SECONDS ? Number(env.SIG_TTL_SECONDS) : NaN;
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.max(60, Math.min(900, Math.floor(v)));
}
function getMaxTokens(env){
  const v = env.LLM_MAX_TOKENS ? Number(env.LLM_MAX_TOKENS) : NaN;
  if (!Number.isFinite(v) || v <= 0) return 500;
  return Math.min(1024, v);
}
function clampInt(v, def){ const n=Number(v); return Number.isFinite(n)?n:def; }
function sanitizeLocale(s){ if(!s) return "en"; const t=String(s).trim().toLowerCase(); return /^[a-z]{2}(-[a-z]{2})?$/.test(t)?t:"en"; }
function extractTranscript(res){
  if (!res) return "";
  if (typeof res === "string") return res;
  if (typeof res.text === "string") return res.text;
  if (Array.isArray(res.results) && res.results[0]?.text) return res.results[0].text;
  if (typeof res.output_text === "string") return res.output_text;
  return "";
}

/////////////////////// CRYPTO ///////////////////////
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256HexOfRequest(req){
  const buf = await req.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function sha512B64(input){
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-512", enc);
  return b64(hash);
}

// HMAC-SHA512 using SHARED_KEY as *base64* secret; returns base64 signature
async function hmacSha512B64(secretBase64, message){
  if (!secretBase64) throw new Error("missing_shared_key");
  const keyBytes = base64ToBytes(secretBase64);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    {name:"HMAC", hash:"SHA-512"},
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64(sig);
}

// Detached hex helper if you want X-Signature-HMAC-SHA512-style headers
async function signBodyWithHmac(env, bodyText) {
  // env.SHARED_KEY must be the base64 string stored as a secret.
  const sigB64 = await hmacSha512B64(env.SHARED_KEY, bodyText);
  const sigBytes = base64ToBytes(sigB64);
  const hex = [...sigBytes].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex;
}

function b64(buf){
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer||buf);
  let bin=""; for (let i=0;i<u8.length;i++) bin+=String.fromCharCode(u8[i]);
  return btoa(bin);
}

// RFC 7638 JWK thumbprint (for EC P-256 public JWK)
async function rfc7638ThumbprintB64url(jwk){
  const obj = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
  const json = JSON.stringify(obj);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return base64url(new Uint8Array(digest));
}
function base64url(u8){
  let s=""; for (let i=0;i<u8.length;i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

/////////////////////// JSON ///////////////////////
function json(obj,status=200,extra){ const h={"content-type":"application/json; charset=UTF-8",...(extra||{})}; return new Response(JSON.stringify(obj),{status,headers:h}); }
