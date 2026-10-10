# Mirana

Mirana is a buying workspace: describe a product in free-form text or paste a product link, refine the budget and priorities, and save a researched shortlist with a #1 recommendation. Its minimal dark interface includes a persistent shopping list, review evidence, price observations and optional per-item deal alerts.

This directory contains the Next.js/Turso application and the enhanced local implementation of staged research with independent source reading and typed claim evidence. It includes Google sign-in, owner-scoped persisted jobs, protected dispatch and Resend integration. Accounts, credentials and successful provider/checkout/email validation remain environment-specific. The production release is explicitly authorized on 10 October 2026. Research uses Gemini 3.8 Flash through Google ADK; the owner-private legacy Site remains unchanged. See RELEASE_VERIFICATION.md for deployment and live-test status.

Use [SETUP.md](SETUP.md) for provider and deployment steps, [MIGRATION.md](MIGRATION.md) to move existing shopping data, and [RESEARCH_WORKER.md](RESEARCH_WORKER.md) for research evidence and worker behavior. Automatic deal emails additionally require an actual merchant-checkout verification service described in [OFFER_VERIFIER.md](OFFER_VERIFIER.md); no such service is implemented or connected here.

## Product behavior

- Brand and model name are required for new items. Free-form needs, product links, budget, delivery postcode, preferences and requested top N are optional; supplied requirements constrain research.
- Category-aware research across official stores, Amazon India, Flipkart and relevant reputable retailers, with source coverage and unknowns recorded.
- Ranked recommendations with pros, cons, hands-on reviews and clearly distinguished owner anecdotes. Fewer than N are returned when fewer qualify.
- Persisted hard/soft requirement planning, discovery, independent original-page reading, typed claim/gap assessment, bounded follow-up, synthesis and verification; read-only plan/progress, cancellation and retry through the UI/API/WebMCP.
- Account-specific shopping lists and reports; Google identity is required in production.
- Opt-in alerts with daily IST, 12-hour and custom interval choices. The dispatcher must run often enough to honor the selected interval.
- Email only for a qualifying offer, with deduplication, verified total cost and eligible price history or a user-selected target price.

The app does not purchase products, promise coverage of every retailer, or infer sensitive personality traits. Instinct AI has no verified integration in this build. The Vercel worker uses a separately configured research provider; a ChatGPT subscription or the previous Sites researcher does not automatically supply an API key.

## Development

Use Node.js 22.15 or later. From this directory:

```sh
npm ci
cp -n .env.example .env.local
npm run db:migrate
npm run dev -- --port 5174
```

Copy the example only if `.env.local` does not already exist; preserve saved credentials. Choose a local `file:` database before migrating for localhost development. Never commit environment files, OAuth client downloads or database exports.

Initial research requires configured provider credentials. The default is `RESEARCH_PROVIDER=openai` with `OPENAI_API_KEY` and model `gpt-5.5`. Explicitly set `RESEARCH_PROVIDER=vertex`, `GOOGLE_API_KEY` and `GOOGLE_CLOUD_PROJECT` to opt into ordinary Vertex AI calls with `gemini-3.8-flash`; keys alone do not switch providers.

After an item is saved, authenticated `POST /api/research` persists an owned job and requests a worker wake-up through Next.js `after`. Completed stages survive refresh. `after` does not guarantee continuous execution, so start the local dispatcher explicitly in a second terminal against the same local database:

```sh
npm run worker:local
```

This command rejects hosted databases and production/Vercel execution. It can incur configured AI usage charges and is not started with the dev server. The production dispatcher runs once every 24 hours at approximately 10 AM IST. Longer initial research can checkpoint and require another authenticated wake-up; the daily cron is a fallback rather than a guarantee of prompt multi-stage continuation. Due opted-in watches use saved-offer refresh without an LLM or broad discovery.

Search excerpts are discovery leads. A separate bounded reader fetches original pages from exact approved hosts and records blockers, text hashes, dates and direct-quote references. Claim assessment distinguishes hard requirements, secondary preferences, specifications, measurements, opinions and anecdotes; contradictions and unknown mandatory costs remain visible. Quotes prove text association, while model interpretation and complete semantic correctness remain fallible. Merchant checkout is separately verified. Safe structured server logs (`RESEARCH_LOG_LEVEL=info`) expose hashed job stages, counts and usage without identities, prompts, original bodies or hidden reasoning.

Build and verification:

```sh
npx tsc --noEmit
npm run build
npm test
```

## Structure

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Shopping list, onboarding, comparisons, preferences and alert controls |
| `app/api/auth/` | Google OAuth/OIDC and server sessions |
| `app/api/purchases/`, `workspace/`, `preferences/` | Account-scoped data |
| `app/api/automation/` | Protected queue and report writer |
| `app/api/research/`, `app/api/cron/` | Account-scoped initial research and protected scheduled dispatch |
| `lib/research/iterative.ts`, `provider.ts` | Bounded stages and explicit server-side provider transport |
| `lib/research/source-reader.ts`, `claims.ts`, `logs.ts` | Independent bounded reads, typed quote-associated claims and safe hashed diagnostics |
| `lib/research-jobs.ts`, `lib/worker.ts` | Persisted checkpoints, brief/lease fencing, retry and dispatch |
| `scripts/research-local-worker.mjs` | Explicit local-file-only continuous dispatcher |
| `lib/deals.ts` | Offer eligibility and per-item cadence |
| `lib/email.ts` | Resend delivery and duplicate suppression |
| `app/admin/usage/`, `app/api/admin/usage/`, `lib/admin/` | Verified-owner-only provider balance dashboard and protected usage API |
| `db/`, `drizzle/`, `scripts/` | Persistent schema and migration tools |

Standard Google sign-in registration is free. Hosting, database usage, AI research and email have independent plans and usage costs; this app does not guarantee a free deployment. Vercel Hobby's daily cron cannot service 12-hour or custom hourly checks. See SETUP.md before selecting a scheduler.

AI web research and independently read listing prices remain provisional for email eligibility. A research API key and a Resend key alone do not enable verified deal delivery. The merchant adapter must obtain real checkout totals, required kit, seller and postcode delivery evidence; it is a separate service to implement or connect. There is no ready-made Amazon or Flipkart checkout API integration in this migration.

See [WEBMCP.md](WEBMCP.md) for browser tool coverage and local verification. Develop and test on localhost; production releases require an explicit user request.

See [ADMIN_USAGE.md](ADMIN_USAGE.md) for the private API credit dashboard, local Google sign-in setup, live account-check results and provider limitations. `npm run usage:status` reads account usage without starting research. [ADK_TOOL_DESIGN.md](ADK_TOOL_DESIGN.md) documents the implemented local Google ADK migration, strict tools, checkpoints and verification.

See [GEMINI_BENCHMARK.md](GEMINI_BENCHMARK.md) for the bounded local Vertex AI comparison. It evaluates model outputs without switching the application's research provider or sending deal alerts.

See [DEEP_RESEARCH_DESIGN.md](DEEP_RESEARCH_DESIGN.md) for the enhanced local iteration, original-reading and claim-evidence contracts, evidence limitations, bounded execution and remaining release work. It follows an iterative agent workflow and does not invoke Google's managed Deep Research agent.

See [LOCAL_RESEARCH_VERIFICATION.md](LOCAL_RESEARCH_VERIFICATION.md) for current enhanced verification status, the earlier isolated live Vertex result and remaining release gates. That earlier smoke test predates the original-reader/claim-ledger changes and does not verify their live quality.

## Local live-product tools

The opt-in Gemini 3.8 Flash discovery loop can call SerpApi Shopping/web MCP, Bright Data exact-listing API/read-only MCP, and optional Keepa Amazon India history. See [PRODUCT_TOOLS_SETUP.md](PRODUCT_TOOLS_SETUP.md). `npm run tools:status` reports readiness without provider calls. Fixture tests cover the ADK/MCP loop, structured ADK stages, durable budgets, cancellation and the API evidence pipeline. Recommendation quality and checkout remain separately unverified. Local development only; this integration does not change production deal refresh or email qualification.
