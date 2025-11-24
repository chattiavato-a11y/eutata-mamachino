# Testing matrix

This guide adapts Cloudflare's [Testing your agent](https://developers.cloudflare.com/agents/getting-started/testing-your-agent/) playbook to the Chattia Worker + UI stack. Run the checks after provisioning the secrets and bindings listed in the repository README.

## 1. Environment validation
| Check | Command | Expected outcome |
| --- | --- | --- |
| Worker health | `curl -i "$WORKER_URL/health/summary" -H "X-Integrity: $INTEGRITY_VALUE"` | `200 OK` plus JSON block confirming KV, AI, and signature settings.
| Secrets | `wrangler secret list --json | jq '.[] | select(.name=="SHARED_KEY")'` | Entry exists for `SHARED_KEY` (and `TURNSTILE_SECRET` if enabled).
| Bindings | `wrangler deployments list` | Active deployment references the KV/R2/D1 IDs from `wrangler.toml`.

## 2. Signature + replay flow
1. Mint a signature:
   ```bash
   curl -X POST "$WORKER_URL/auth/issue" \
     -H "Content-Type: application/json" \
     -H "X-Integrity: $INTEGRITY_VALUE" \
     -H "X-OPS-Channella: $CHANNELLA_TOKEN" \
     -d '{"nonce":"abc","protocol":"https","pathname":"/api/chat"}'
   ```
2. Use the response headers/body to construct the signed `/api/chat` request shown in `index.html` (`signedPost`).
3. Repeat the same call with the **same nonce** and confirm you receive `409 replay_detected`, proving KV-backed nonce storage works.

## 3. Workers AI invocation
| Scenario | How to run | What to verify |
| --- | --- | --- |
| Happy path chat | Trigger `/api/chat` from the UI or `curl` | Worker streams a model response and stores transcript data if `OPS_TRANSCRIPTS_KV` is bound.
| Max token guard | Send `maxTokens` beyond `LLM_MAX_TOKENS` | Worker returns a `400 token_limit` error before calling Workers AI.
| STT upload | `curl -F file=@sample.wav "$WORKER_URL/api/stt"` with signatures | Worker returns JSON transcript and enforces `MAX_UPLOAD_BYTES`.

## 4. Governance & safety controls
- **Turnstile** – With `TURNSTILE_SECRET` set, omit the `cf-turnstile-response` header from a chat request. The Worker must return `turnstile_required`.
- **Honeypot** – Submit a payload containing the honeypot field defined in `index.html` and ensure the Worker logs and blocks the request.
- **Escalation** – Force low confidence by returning the fallback response; confirm the UI posts telemetry to `ESCALATION_WEBHOOK`.

## 5. Chaos & fallback drills
| Drill | Method | Success criteria |
| --- | --- | --- |
| Workers AI outage | Temporarily revoke AI access or stub the binding | UI shows “Primary API unreachable – using local safeguard,” Worker emits `ai_unavailable` metrics.
| KV failure | Remove the nonce KV binding and re-run auth | Worker returns `500 nonce_kv_missing`, demonstrating observability of misconfiguration.
| Network partition | Block the Worker hostname via `/etc/hosts` | UI automatically serves responses from `services/fallback_kb.js` for 90 seconds.

Document findings (pass/fail, logs, remediation) so they can feed PCI DSS Req. 10 and OPS CyberSec Core audit reports.
