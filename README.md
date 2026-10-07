# Mirana

Mirana is a buying workspace: describe a product in free-form text or paste a product link, refine the budget and priorities, and save a researched shortlist with a #1 recommendation. Its minimal dark interface includes a persistent shopping list, review evidence, price observations and optional per-item deal alerts.

This directory contains the prepared Vercel migration. It is a standalone Next.js app with a durable libSQL/Turso database, Google sign-in, a protected research worker and Resend email integration. Deployment and provider activation still require accounts and credentials. No Vercel address has been provisioned or verified yet. The existing Sites deployment remains an owner-private preview while the migration is validated.

Use [SETUP.md](SETUP.md) for provider and deployment steps, [MIGRATION.md](MIGRATION.md) to move existing shopping data, and [RESEARCH_WORKER.md](RESEARCH_WORKER.md) for research evidence and worker behavior. Automatic deal emails additionally require an actual merchant-checkout verification service described in [OFFER_VERIFIER.md](OFFER_VERIFIER.md); no such service is implemented or connected here.

## Product behavior

- Free-form or product-link onboarding with explicit budget, delivery postcode, preferences and requested top N.
- Category-aware research across official stores, Amazon India, Flipkart and relevant reputable retailers, with source coverage and unknowns recorded.
- Ranked recommendations with pros, cons, hands-on reviews and clearly distinguished owner anecdotes. Fewer than N are returned when fewer qualify.
- Account-specific shopping lists and reports; Google identity is required in production.
- Opt-in alerts with daily IST, 12-hour and custom interval choices. The dispatcher must run often enough to honor the selected interval.
- Email only for a qualifying offer, with deduplication, verified total cost and eligible price history or a user-selected target price.

The app does not purchase products, promise coverage of every retailer, or infer sensitive personality traits. Instinct AI has no verified integration in this build. The Vercel worker uses a separately configured research provider; a ChatGPT subscription or the previous Sites researcher does not automatically supply an API key.

## Development

Use Node.js 22.13 or later. From this directory:

```sh
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev -- --port 5174
```

Fill `.env.local` privately before applying a remote database migration. A local database can be used for development as described in SETUP.md. Never commit environment files, OAuth client downloads or database exports.

After an item is saved, authenticated `POST /api/research` starts account-scoped research after the response through Next.js `after`. Scheduled dispatch retries queued work and checks due opted-in watches. Neither route can research without the configured provider credentials.

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
| `lib/deals.ts` | Offer eligibility and per-item cadence |
| `lib/email.ts` | Resend delivery and duplicate suppression |
| `db/`, `drizzle/`, `scripts/` | Persistent schema and migration tools |

Standard Google sign-in registration is free. Hosting, database usage, AI research and email have independent plans and usage costs; this app does not guarantee a free deployment. Vercel Hobby's daily cron cannot service 12-hour or custom hourly checks. See SETUP.md before selecting a scheduler.

AI web research and independently read listing prices remain provisional for email eligibility. A research API key and a Resend key alone do not enable verified deal delivery. The merchant adapter must obtain real checkout totals, required kit, seller and postcode delivery evidence; it is a separate service to implement or connect. There is no ready-made Amazon or Flipkart checkout API integration in this migration.
