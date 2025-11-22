# Deployment and minimal asset guidance

This Worker enforces OPS CySec Core controls (detached signatures, integrity headers, honeypot/Turnstile guards). You can run it with a minimal set of Cloudflare resources and opt into additional storage only when you need it.

## Minimal, secure-by-default footprint

| Component | Required? | Purpose | Notes |
| --- | --- | --- | --- |
| `AI` (Workers AI binding) | Yes | Runs the LLM and STT models. | Defined in `wrangler.toml` `[ai]`. |
| `OPS_NONCE_KV` | Yes | Replay defense for detached signatures (`/auth/issue`, `/api/chat`, `/api/stt`). Also reused as the honeypot banlist if no dedicated banlist KV is set. | Keep this KV even in lean deployments; without it you lose nonce replay protection. |
| `OPS_BANLIST_KV` | Optional | Dedicated store for honeypot/IP bans. | Omit to reuse `OPS_NONCE_KV`. |
| `OPS_TRANSCRIPTS_KV` | Optional (commented out) | Store transcripts/scan reports. | Disabled by default to keep asset count low. |
| `OPS_ARTIFACTS_R2` | Optional (commented out) | Persist sanitized artifacts from scans. | Enable only when you need binary storage. |
| `OPS_TRAINING_DB` (D1) | Optional (commented out) | Persist training or memory data. | Enable only if you introduce DB-backed memory. |

### Why keep at least one KV
`OPS_NONCE_KV` is necessary for detached signature replay defense and for blocking honeypot abuse. If you remove **all** KV namespaces the Worker will answer with `signature_replay`/`channella_secret_missing` style errors or silently lose protections. To stay compliant with the integrity model, keep `OPS_NONCE_KV` even when trimming other assets.

## How to run with the minimal set
1. Create **one** KV namespace and bind it as `OPS_NONCE_KV` in `wrangler.toml`.
2. Leave the other KV/R2/D1 blocks commented out unless you explicitly need them.
3. Set secrets: `wrangler secret put SHARED_KEY`, `wrangler secret put CHANNELLA`, and any others you use (`TURNSTILE_SECRET`, `ESCALATION_WEBHOOK`, etc.).
4. Deploy: `wrangler deploy`.

This keeps asset IDs to the minimum required for secure operation while leaving a clear path to add storage later without changing code.
