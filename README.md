# Chattia Integrity Gateway

This repository contains the Chattia secure chat experience:

- **Cloudflare Worker** (`src/worker.js`) that issues detached signatures, proxies chat/STT calls to Workers AI, and enforces integrity headers, honeypots, and replay defense.
- **Static client** (`index.html` plus `js/` helpers) served from GitHub Pages that talks to the Worker, renders fallback responses, and reports telemetry.
- **Shared prompt content** in `services/` that grounds responses on the Worker and the browser.

## Prerequisites
1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) 3.0+ and authenticate with `wrangler login`.
2. Provision the Cloudflare resources referenced in `wrangler.toml`:
   - KV namespaces for nonces, transcripts, and ban lists (`OPS_*_KV`).
   - An R2 bucket for artifacts and a D1 database for training data.
   - A Workers AI binding (`[ai] binding = "AI"`).
3. Set required secrets via `wrangler secret put`, especially `SHARED_KEY` (signature minting) and `TURNSTILE_SECRET` if you intend to enforce Turnstile.
4. Update `wrangler.toml` with real IDs and domain settings so that the UI and Worker share the same integrity headers and origins.

## Local development
```bash
# Run the Worker against the remote Workers AI runtime for end-to-end tests
wrangler dev src/worker.js --remote

# Serve the static UI locally (for example with Python)
python3 -m http.server 4173
```
Configure the UI to point at your local Worker tunnel by adjusting `CF_WORKER_URL` in `index.html` during local tests.

## Testing your agent
Follow Cloudflare's official [Testing your agent](https://developers.cloudflare.com/agents/getting-started/testing-your-agent/) guide and pair it with this repo:

1. **Health checks** – run `curl <worker>/health/summary` to verify integrity headers, KV bindings, and AI availability before running scripted tests.
2. **Signature flow** – issue a nonce via `POST <worker>/auth/issue` with the required headers, then immediately call `/api/chat` with the signed payload to confirm replay defense works end-to-end.
3. **Degraded-mode drills** – purposely fail the chat call to observe the UI banner (`Primary API unreachable – using local safeguard`) and validate that the fallback KB in `services/fallback_kb.js` is returned.
4. **Turnstile and honeypot enforcement** – if `TURNSTILE_SECRET` and honeypot checks are enabled, send requests without the tokens to ensure the Worker blocks them before calling Workers AI.

For a step-by-step validation matrix—including manual, automated, and chaos scenarios—see [`docs/testing.md`](docs/testing.md).
