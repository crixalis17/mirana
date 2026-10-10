# Mirana setup for Vercel

This guide covers local validation and a later Vercel release. The enhanced staged research iteration is implemented locally, with final verification in progress, and has not been deployed. Existing production configuration and the owner-private Sites preview remain unchanged. Google sign-in, the selected research provider, merchant checkout and email delivery must each be validated in the environment being configured.

You can use a Vercel-provided production address without buying a domain. Use the actual stable alias assigned to your project everywhere below; for an existing Mirana deployment, retain its configured alias. Preview URLs may differ and should not be used as production OAuth callbacks. A new project's preferred alias must be confirmed during deployment.

## 1. Prepare accounts and database

Create/sign in to [Vercel](https://vercel.com) and [Turso](https://turso.tech). Create a Turso database and obtain its database URL and authentication token in the Turso dashboard or CLI. Store these privately as `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. The production application requires a hosted database; a local SQLite file is only for development.

Use a separate database for development or preview deployments. Do not connect arbitrary preview branches to your production shopping data.

From the repository root:

```sh
npm ci
cp -n .env.example .env.local
```

Copy the example only if `.env.local` does not already exist; preserve saved credentials. Fill it privately and choose a local `file:` database for localhost testing, then apply the schema:

```sh
npm run db:migrate
```

The migration CLI applies the checked-in schema once per migration, including the new `research_jobs` table. It does not transfer the Sites D1 data. Follow [MIGRATION.md](MIGRATION.md) to move existing records. Verify the database URL before running a migration against a remote database; this local iteration does not authorize a production migration.

Local development defaults to `file:./mirana.local.db` when no remote URL is configured. Run `npm run dev -- --port 5174`, matching the supplied `APP_ORIGIN`. A labelled local preview requires explicit `AUTH_PREVIEW_MODE=true` on localhost when Google is unconfigured; production never grants a shared preview identity. Optional `MIRANA_DEMO_MODE=true` adds local example data only in that development preview. Normal Google accounts start empty.

Official guidance: [Turso quickstart](https://docs.turso.tech/quickstart).

## 2. Create the Vercel project

Import your repository in Vercel and set:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | Repository root (`./`) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | Next.js default; leave unset |
| Node.js version | Node 24.13.0+ for the pinned Google ADK runtime (choose Node 24 when available) |

Choose a project name and production alias without your email username. The deployment's shareable production alias, rather than the Sites address, resolves the email-username concern. A custom domain remains optional.

CLI alternative, run from the repository root:

```sh
npx vercel login
npx vercel link
npx vercel
```

Finish configuration before production deployment. Add secrets through Vercel **Settings → Environment Variables**, scoped to the intended environment. Alternatively `npx vercel env add VARIABLE_NAME production` prompts for a value without embedding it in a command. Redeploy after changing runtime configuration.

Official references: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Vercel deploy CLI](https://vercel.com/docs/cli/deploy).

## 3. Finish Google sign-in yourself

Create or select your own Google Cloud project named **Mirana**, then open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Configure the consent screen and web client in that project. Standard Google sign-in does not require linking a billing account.

1. Click **Get started**, set app name **Mirana**, and select your support and developer contact emails.
2. Choose **External** audience. Keep the app in **Testing** for initial validation; add your Google account under test users if requested.
3. Request only basic identity: `openid`, email and profile.
4. Under **Clients → Create client**, select **Web application** and name it **Mirana Web**.
5. Add the authorized redirect URI formed from your actual stable Vercel origin plus `/api/auth/callback`. For example, replace the placeholder in `https://YOUR-AVAILABLE-APP.vercel.app/api/auth/callback` with the assigned alias. Do not copy the old Sites callback.
6. Download the client JSON privately. Configure `GOOGLE_CLIENT_ID` and secret `GOOGLE_CLIENT_SECRET` in Vercel. Never paste the secret into chat or commit the downloaded JSON.
7. Set `APP_ORIGIN` to that same HTTPS origin, without a path or trailing slash, and redeploy.

For local Google testing, use a separate client with `http://127.0.0.1:5174/api/auth/callback` and set local `APP_ORIGIN=http://127.0.0.1:5174`. Production uses the stable production alias; do not replace it with an ephemeral preview URL. Test login, logout and isolation between two Google accounts before sharing the app.

The standard Google sign-in registration does not require a paid Google Cloud service. This does not make the other application services free. Reference: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## 4. Configure server environment

None of these credentials belongs in a `NEXT_PUBLIC_` variable, browser code, a URL or a committed file.

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Actual stable HTTPS production origin; must match the Google callback origin |
| `TURSO_DATABASE_URL` | Hosted libSQL/Turso database URL |
| `TURSO_AUTH_TOKEN` | Database access token |
| `GOOGLE_CLIENT_ID` | Your Google web client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google web client secret |
| `AUTOMATION_SECRET` | Random secret of at least 32 characters protecting the queue/report writer |
| `CRON_SECRET` | A different random secret of at least 32 characters protecting the dispatcher |
| `OPENAI_API_KEY` | Separate OpenAI API key for research; API usage is billed independently of ChatGPT |
| `OPENAI_RESEARCH_MODEL` | Optional research model; default `gpt-5.5` |
| `RESEARCH_PROVIDER` | `openai` by default; explicitly choose `vertex` to use the Google credentials below |
| `GOOGLE_API_KEY` | Server-side Vertex AI key, required only for explicit Vertex research or the separate benchmark |
| `GOOGLE_CLOUD_PROJECT` | Explicit Google Cloud project ID charged by the Vertex requests |
| `GEMINI_RESEARCH_MODEL` | Optional Vertex model; default `gemini-3.8-flash` |
| `RESEARCH_MAX_JOBS` | Jobs per dispatch; default 1, maximum 2 |
| `RESEARCH_STEP_TIMEOUT_MS` | Staged-call timeout; default 120000 ms, bounded to 10000–180000 |
| `RESEARCH_MAX_CALLS` | Attempted generation calls per job; default/maximum 8 |
| `RESEARCH_MAX_ROUNDS` | Targeted follow-up rounds; default/maximum 2 |
| `RESEARCH_MAX_INPUT_TOKENS` | Estimated/recorded input limit; default 100000, maximum 200000 |
| `RESEARCH_MAX_OUTPUT_TOKENS` | Output limit; default 24000, maximum 48000 |
| `RESEARCH_TIMEOUT_MS` | Legacy two-call helper timeout only; not the new staged worker timeout |
| `RESEARCH_LOG_LEVEL` | `info` for safe structured server diagnostics; `off` disables logging; `debug` keeps the same privacy restrictions |
| `WORKER_MIN_INTERVAL_HOURS` | 24 for daily Hobby dispatch; 1 for an external or Pro hourly dispatcher |
| `RESEND_API_KEY` | Resend sending key, needed for emails |
| `EMAIL_FROM` | Authorized Mirana sender address, needed for emails |
| `OFFER_VERIFIER_URL` | Optional operator-controlled HTTPS checkout-verification service endpoint |
| `OFFER_VERIFIER_TOKEN` | At least 32 characters; authenticates requests to that service |
| `OFFER_VERIFIER_SIGNING_SECRET` | A different secret of at least 32 characters; validates signed checkout receipts |

Generate independent machine secrets with a password manager or a cryptographically secure local generator and save them directly in Vercel. Do not reuse an OAuth secret as a worker secret. Google-authenticated users cannot impersonate the research worker.

## 5. Activate research and choose scheduling

The staged worker defaults to OpenAI Responses web search. To use Vertex AI locally, set `RESEARCH_PROVIDER=vertex` explicitly and provide `GOOGLE_API_KEY` plus `GOOGLE_CLOUD_PROJECT`; the default Gemini model is `gemini-3.8-flash`. Google keys alone do not switch providers. Requests use ordinary explicit-project global `generateContent`, not Google's managed Deep Research preview. The previous Sites/Codex cloud researcher is not automatically moved to Vercel. Instinct AI is not connected. API calls can incur charges, and Google promotional-credit eligibility must be checked separately.

Saving a new item requests initial research through authenticated `POST /api/research`. The route checks ownership, persists a job and requests a wake-up after its response with Next.js `after`. Stages are plan, gather, independent original-page read, claim assessment, up to two targeted follow-up/read/reassessment rounds, synthesize, verify and publish. Planning separates hard requirements from secondary preferences. The read stage consumes no generation call and is saved as its own checkpoint. The plan is read-only. Progress, cancellation and retry are exposed through `/api/research` and WebMCP. Completed steps survive refresh; retry does not reset the job's attempted-call limits.

For sustained localhost execution, run this explicitly in a second terminal against the same local `file:` database after migration:

```sh
npm run worker:local
```

The script loads `.env.local`, rejects hosted database URLs and production/Vercel execution, and pauses five seconds between dispatches. It is not started automatically by the dev server and can invoke billable providers. Do not use it against production data. Next.js `after` is a wake-up opportunity, not a continuous worker. A reliable frequent production dispatcher remains unresolved; daily cron can leave partially completed jobs waiting for another invocation.

Provider-associated citation/grounding excerpts are discovery leads. The independent reader fetches only exact approved official/retailer/review/owner domains, blocks redirects and access gates, and uses an eight-second/one-MiB limit per source, at most 12 sources and concurrency three per round. Stored original text is capped at 12000 characters/source and 36000/round, with bounded direct quotes, retrieval/publication metadata, hashes and explicit truncation. Typed claim assessment requires original quote association and preserves contradictions/unknowns; models remain semantically fallible and neither quotations nor listing prices prove checkout. `RESEARCH_LOG_LEVEL=info` reports hashed job/stage/count/usage diagnostics without prompts, identities, page bodies, provider payloads or hidden reasoning. See [DEEP_RESEARCH_DESIGN.md](DEEP_RESEARCH_DESIGN.md) for limits and evidence contracts. Due opted-in watches refresh saved exact listings without LLM calls; provider credentials are needed for new research, not those saved-offer checks.

`GET /api/cron` requires `Authorization: Bearer <CRON_SECRET>`. Queue/report operations at `/api/automation` require the separate `Authorization: Bearer <AUTOMATION_SECRET>`. Vercel attaches the cron bearer secret when configured; an external scheduler must supply it as a private header. Never put either secret in a query string.

The checked-in `vercel.json` provides a daily dispatcher at 04:30 UTC (10:00 IST), suitable for Hobby. Vercel documents a once-daily maximum and up to 59 minutes of timing variation on Hobby. This cannot honor 12-hour or hourly custom checks. For those choices, use one of these:

- An external scheduler that requests the protected `/api/cron` endpoint hourly over HTTPS with the secret header.
- A Vercel plan supporting hourly cron, with the hourly configuration supplied in `vercel.pro.json` copied to `vercel.json` before deploying.

Set `WORKER_MIN_INTERVAL_HOURS=1` only when the dispatcher actually runs hourly. A daily dispatcher can satisfy daily or longer checks, subject to capacity and timing; it cannot promise the exact minute selected in the UI. Per-job leases fence research checkpoints, and item leases protect due deal checks. Default capacity is one job per dispatch. A worker has a 200-second invocation budget and releases completed checkpoints when insufficient time remains to start the next stage. Provider timeouts, queue capacity and a daily dispatcher can therefore delay completion. Verify a reliable frequent production dispatcher before release.

If using an external scheduler, remove the `crons` entry from `vercel.json` and redeploy so there is exactly one dispatch source. Keep the scheduler header secret in its credential settings, and verify its actual execution history before enabling users' 12-hour or custom checks.

Reference: [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [securing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## 6. Activate email alerts

Deal email activation requires a real merchant-checkout verification connection as well as Resend. The migration supplies an adapter contract and receipt validator; it does not implement or connect an Amazon, Flipkart or other merchant checkout service. AI summaries, search snippets and retailer JSON-LD prices do not prove full cost, reliable seller or postcode delivery and cannot qualify an email. Implement or connect a trusted service using [OFFER_VERIFIER.md](OFFER_VERIFIER.md), then configure its three `OFFER_VERIFIER_*` variables. Credentials alone do not establish that the service works; validate actual merchant receipts before claiming verified offer delivery.

Create a [Resend](https://resend.com) account and configure a permitted sender. For sending to other people, verify a sending domain and set `EMAIL_FROM` to an address on it. Resend's test sender can be used only within its recipient restrictions; having a Vercel address does not give you control over a sending domain. Since you do not own a domain yet, email to arbitrary users remains a separate setup step.

Set `RESEND_API_KEY` and `EMAIL_FROM`, redeploy, sign in with Google and opt into alerts on an item. The recipient is your verified Google email. No offer means no email. A successful research run is not proof of email delivery: verify a qualifying result and the actual provider status before claiming delivery works.

Reference: [Resend's testing-recipient and domain restrictions](https://resend.com/docs/api-reference/errors#validation-error-2).

## 7. Validate, then share

```sh
npx tsc --noEmit
npm run build
npm test
```

Complete localhost validation first, including the enhanced original-reader/claim-ledger flow. The earlier four-call Vertex smoke test ran before these additions and does not establish enhanced live quality. Production migrations, configuration changes and deployment require an explicit release request. At that point, deploy with the existing project workflow or `npx vercel --prod`, then verify the production URL, Google callback, persisted shopping data, account isolation, rejected unauthorized worker calls, checkpoint recovery, frequent dispatch, actual authenticated merchant checkout receipts and opt-in email delivery. Keep the old Sites preview and its data intact until the new target passes these checks. Pause its old schedule only at the validated cutover to prevent duplicate research.

Hosting, database, research tokens/web searches, email and optional paid scheduling are separate costs. Check each provider's current plan and spending controls before enabling unattended research; no whole-app free-cost guarantee is made.

## Release configuration (10 October 2026)

The current daily-only UI uses the checked-in 10 AM IST cron. Enable released ADK research with `RESEARCH_PROVIDER=vertex`, `GEMINI_RESEARCH_MODEL=gemini-3.8-flash`, `RESEARCH_TOOLS_ENABLED=true`, and `RESEARCH_PRODUCTION_ENABLED=true`. Keep keys server-only. `RESEARCH_USER_DAILY_JOB_LIMIT=3` and `RESEARCH_DAILY_JOB_LIMIT=10` enforce shared rolling-24-hour new-job allowances; these are distinct from existing per-job model/tool limits. The research job table/indexes are created additively on first authenticated research use; existing account data is preserved. Email credentials and actual checkout verification still need separate setup.
