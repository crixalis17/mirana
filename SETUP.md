# Mirana setup for Vercel

This prepares a new Vercel deployment. It does not change the existing owner-private Sites preview. No Vercel deployment, Google web client, Turso production database, live research call or email delivery has been verified yet.

You can use a Vercel-provided production address without buying a domain. Choose an available app alias without your email username. `mirana.vercel.app` is not reserved or guaranteed available. Use the actual stable alias assigned to your project everywhere below; preview URLs may differ and should not be used as production OAuth callbacks.

## 1. Prepare accounts and database

Create/sign in to [Vercel](https://vercel.com) and [Turso](https://turso.tech). Create a Turso database and obtain its database URL and authentication token in the Turso dashboard or CLI. Store these privately as `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. The production application requires a hosted database; a local SQLite file is only for development.

Use a separate database for development or preview deployments. Do not connect arbitrary preview branches to your production shopping data.

From the repository root:

```sh
npm ci
cp .env.example .env.local
```

Fill `.env.local` privately, then apply the schema:

```sh
npm run db:migrate
```

The migration CLI applies the checked-in schema once per migration. It does not transfer the Sites D1 data. Follow [MIGRATION.md](MIGRATION.md) to move existing records. Verify the database URL before running a migration against a remote database.

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
| Node.js version | Compatible with the package's Node 22 requirement |

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
| `RESEARCH_MAX_JOBS` | Optional bounded jobs per run; default 1 |
| `RESEARCH_TIMEOUT_MS` | Optional per-call research timeout; default 90000 milliseconds |
| `WORKER_MIN_INTERVAL_HOURS` | 24 for daily Hobby dispatch; 1 for an external or Pro hourly dispatcher |
| `RESEND_API_KEY` | Resend sending key, needed for emails |
| `EMAIL_FROM` | Authorized Mirana sender address, needed for emails |
| `OFFER_VERIFIER_URL` | Optional operator-controlled HTTPS checkout-verification service endpoint |
| `OFFER_VERIFIER_TOKEN` | At least 32 characters; authenticates requests to that service |
| `OFFER_VERIFIER_SIGNING_SECRET` | A different secret of at least 32 characters; validates signed checkout receipts |

Generate independent machine secrets with a password manager or a cryptographically secure local generator and save them directly in Vercel. Do not reuse an OAuth secret as a worker secret. Google-authenticated users cannot impersonate the research worker.

## 5. Activate research and choose scheduling

The Vercel worker uses OpenAI Responses web search. Create an API key and configure the research variables above. No API key was supplied during migration preparation, and the previous Sites/Codex cloud researcher is not automatically moved to Vercel. Instinct AI is not connected.

Saving a new item requests initial research through authenticated `POST /api/research`. The route checks ownership and schedules work after its response with Next.js `after`; the cron dispatcher retries any item that remains queued. Initial research therefore does not need to wait for the next daily cron when the provider is configured.

`GET /api/cron` requires `Authorization: Bearer <CRON_SECRET>`. Queue/report operations at `/api/automation` require the separate `Authorization: Bearer <AUTOMATION_SECRET>`. Vercel attaches the cron bearer secret when configured; an external scheduler must supply it as a private header. Never put either secret in a query string.

The checked-in `vercel.json` provides a daily dispatcher at 04:30 UTC (10:00 IST), suitable for Hobby. Vercel documents a once-daily maximum and up to 59 minutes of timing variation on Hobby. This cannot honor 12-hour or hourly custom checks. For those choices, use one of these:

- An external scheduler that requests the protected `/api/cron` endpoint hourly over HTTPS with the secret header.
- A Vercel plan supporting hourly cron, with the hourly configuration supplied in `vercel.pro.json` copied to `vercel.json` before deploying.

Set `WORKER_MIN_INTERVAL_HOURS=1` only when the dispatcher actually runs hourly. A daily dispatcher can satisfy daily or longer checks, subject to dispatch timing; it cannot promise the exact minute selected in the UI. The lease prevents overlap, while due times control which requests are processed. Default capacity is one request per dispatch, so a growing queue requires more capacity or a more frequent scheduler. Function duration and provider timeouts can also limit a run.

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
npx vercel --prod
```

Verify the actual production URL, Google callback, persisted shopping data, account isolation, rejected unauthorized worker calls, a scheduled research write, authenticated actual merchant checkout receipts and opt-in email delivery. Keep the old Sites preview and its data intact until the new target passes these checks. Pause its old schedule only at the validated cutover to prevent duplicate research.

Hosting, database, research tokens/web searches, email and optional paid scheduling are separate costs. Check each provider's current plan and spending controls before enabling unattended research; no whole-app free-cost guarantee is made.
