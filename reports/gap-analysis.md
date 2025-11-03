# Additional L1 Gap Analysis

## Assistant turns are not persisted
`sendMessage` hands `routeChat` a shallow copy of the UI state. Because the orchestrator pushes assistant turns onto the copy, the live `state.messages` array never captures the assistant replies. Subsequent `/api/chat` calls therefore omit the conversation history that L2 expects. (See `main.js` lines 604-640.)

## Guardrail copy crashes on first budget check
Inside `routeChat`, guard warnings call `translate(lang, …)` even though no local `lang` variable exists. The first `Budget.canSpend` check triggers a `ReferenceError`, so none of the guardrail hooks or fallbacks can run. (See `packs/l6_orchestrator.js` lines 363-413.)

## Mode hint never reaches L2
The server payload omits the optional `mode` flag that the data contract reserves for `"hybrid"|"local"|"external"`. Without this field, L2 cannot respect an eventual policy toggle. (See `packs/l6_orchestrator.js` lines 310-314.)

## Theme & language persist beyond the session
`applyTheme`/`applyLanguage` store selections in `localStorage`, but the brief only calls for session-level persistence. SessionStorage keeps preferences ephemeral as required; the current implementation leaks them across browser sessions. (See `main.js` lines 24-34 and 508-520.)
