# Deploying

There are two very different things to deploy. Read this before putting anything on the public internet.

## 1. The demo (safe to make public)

The demo build has no backend, no API key and no shared database: the AI is simulated and all data stays in each
visitor's browser (`localStorage`). It is a static site, so GitHub Pages hosts it for free.

**One-time setup:** on GitHub, open *Settings, Pages* and set **Source** to **GitHub Actions**.

After that, every push to `main` runs `.github/workflows/deploy-demo.yml`: it installs, runs the frontend tests, builds with
`VITE_DEMO=true` and `VITE_BASE=/<repo-name>/`, and publishes `frontend/dist`. The site appears at
`https://<user>.github.io/<repo-name>/`. (`404.html` is a copy of `index.html`, so a deep link still loads the app.)

Build it yourself:
```bash
cd frontend
VITE_DEMO=true VITE_BASE=/ai-chat-application/ npm run build
VITE_BASE=/ai-chat-application/ npx vite preview     # http://localhost:4173/ai-chat-application/
```
Optional build variables: `VITE_GITHUB_URL` (the repository link in the sidebar, About dialog and banner) and
`VITE_PORTFOLIO_URL`. Any static host works the same way (Netlify, Vercel, Cloudflare Pages): build command
`npm run build`, publish directory `frontend/dist`, and set `VITE_DEMO=true`. Leave `VITE_BASE` unset on a root domain.

## 2. The full stack (do NOT expose it as it is)

The backend currently has **no authentication**. Anyone who can reach it can read and delete every conversation and
uploaded document, and can spend your provider API key by sending messages. Deploy it publicly only after you add:

1. user accounts, with an ownership check on every `/conversations` and `/documents` route;
2. per-user rate limits (the key is yours, and so is the bill);
3. a request-size cap at the reverse proxy.

Guardrails (secret and personal-data filtering, rate limits, a request-size cap, security headers and log scrubbing) are on by default and reduce risk, but **they are not authentication**. Rate limits are per client address and kept in memory per process.

Behind a reverse proxy or PaaS router, set `TRUST_PROXY=true` so the limits see each visitor's real address (from `X-Forwarded-For`); otherwise every visitor shares the proxy's address and one noisy client can lock everyone out. Never set it when the API is directly reachable, because the header can then be forged.

For private use (a VPN, a company network, your own machine) it is fine today.

Configuration, all through environment variables (see `backend/.env.example`):

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | The model provider |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API, e.g. `https://chat.example.com` |
| `DATABASE_URL` | SQLite by default; a PostgreSQL URL works with the driver installed |
| `GUARDRAILS`, `GUARDRAIL_SECRETS`, `GUARDRAIL_PII` | Guardrail policy (defaults: on, block secrets, mask personal data) |
| `RATE_LIMIT_*_PER_MINUTE`, `MAX_REQUEST_BYTES`, `TRUST_PROXY` | Abuse limits; see `backend/.env.example` |
| `EMBEDDING_BACKEND` | `fastembed` (default, downloads a ~130 MB model on first use) or `hashing` |

Typical shape: serve the built frontend (`npm run build`, with `VITE_API_URL` pointing at the API) from any static host,
and run the API with `uvicorn main:app --host 0.0.0.0 --port $PORT` behind HTTPS on a container or PaaS host. SQLite needs a
persistent disk. These start commands follow the standard pattern for such hosts but have **not been tested on a specific
platform** here.

## Running Qdrant for the vector store

Document vectors can live in Qdrant instead of SQLite. Run it beside the API, not on the public internet.

1. Set a key, then start it from the repository root:
   ```bash
   echo "QDRANT_API_KEY=$(openssl rand -hex 32)" >> .env       # a .env next to docker-compose.yml, or export it
   QDRANT_VERSION=<the version you tested> docker compose up -d qdrant
   ```
   The compose file binds Qdrant to `127.0.0.1` only. Without `QDRANT_API_KEY` set, Compose refuses to start the service, because an unauthenticated Qdrant lets anyone read and delete every vector.
2. In `backend/.env` set `VECTOR_STORE=qdrant`, `QDRANT_URL=http://localhost:6333` and the same `QDRANT_API_KEY`.
3. Copy the existing documents across (no re-embedding): `cd backend && python tools/reindex_qdrant.py --prune`.
4. Smoke test: upload a document, ask a question with "Use my documents" on, and check the citation. Then delete the document and confirm it no longer answers.

On a PaaS host, Qdrant needs a persistent disk for `/qdrant/storage`, and it must not be reachable from the internet without the key: use the platform's private networking, or put it behind your reverse proxy with TLS. Set `QDRANT_URL` to the private address.

Rules to keep: never run Qdrant without a key outside your own machine; back up both `chat.db` and the Qdrant volume (the database is the truth, so Qdrant can always be rebuilt with `reindex_qdrant.py`); and after changing the embedding model, run the reindex again, because the model's vectors go in their own collection.

## Hardening the frontend host
The API sends its own security headers, but the static site is served by your host. Where it lets you set headers, add
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a Content-Security-Policy that allows only your own scripts and
your API origin (`connect-src 'self' https://your-api`). GitHub Pages cannot set headers, which is one more reason the public
demo is the simulated build with no real data.
