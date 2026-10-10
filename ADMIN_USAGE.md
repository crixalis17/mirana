# Private API usage dashboard

Open `/admin/usage` on localhost, or use **API usage** in the shopping-list sidebar after signing in. Both the page and `/api/admin/usage` authorize the server-stored session before rendering or reading a provider account. The only permitted identity is the Google-verified email matching the server-only `ADMIN_OWNER_EMAIL`. This field is already set to the requested owner account in the ignored local environment; the owner's address is not baked into application source or browser code. An unset value denies everyone. Other accounts, expired sessions, the local preview and client-supplied email/admin flags cannot grant access.

Google sign-in now records the verified provider and email-verification flag in the session. Sessions created before this change keep working for shopping, but need **one sign-out/sign-in** before gaining dashboard access. No records are reassigned and no existing shopping data is migrated.

## Local sign-in

The local `.env.local` currently has research-provider keys but lacks `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Add the existing web OAuth client's credentials there, using the same field names already in `.env.example`. Do not commit this file or put secrets in `NEXT_PUBLIC_*` variables.

For the existing local port, set `APP_ORIGIN=http://127.0.0.1:5176`. Add that exact local origin and `http://127.0.0.1:5176/api/auth/callback` to the Google OAuth web client's permitted local URLs. If using `localhost` instead, consistently use `http://localhost:5176` in the browser, `APP_ORIGIN` and OAuth configuration. Restart the dev server after changing credentials. Keep the existing production URLs configured separately.

Sign in through Mirana with the owner account, then open `/admin/usage`. Local preview cannot open this page. No new admin password, API key or public bypass is needed.

On any future deployment, set `ADMIN_OWNER_EMAIL` privately on that server as well. This change does not update Vercel or any production environment.

## What the cards report

| Provider | Automated read | Limitation |
| --- | --- | --- |
| SerpApi | Remaining searches, monthly usage/allowance, extra credits and renewal | Account totals, including use outside Mirana. |
| Firecrawl | Team credits remaining, plan allowance and billing-period end | Extra credits can inflate the remaining balance; used credits are not inferred from subtraction. |
| Tavily | Plan credits remaining/used, plan allowance, separate paygo and API-key figures | Mirana's configured keyless research mode has a different allowance. Account credit figures do not measure anonymous usage. |
| Bright Data | USD account balance, credit, prepayment and pending costs when permitted | The free scraper-credit allowance is not exposed by this endpoint. The current key's balance read was denied. |
| Keepa | Token balance and replenishment rate when a key is configured | A replenishing token bucket, not monthly prepaid credits. No key is configured locally. |
| Gemini / Vertex AI | Billing console link | A Vertex model API key cannot read promotional-credit balances. Separate billing access/export is required. |
| Resend | Provider console link when configured | Sending credentials alone do not expose the account allowance through this integration. |
| Turso | Provider console link when hosted storage is configured | Database credentials do not grant organization billing access. |

Zero is displayed as zero. Unknown values stay unknown. Each provider has a separate status so one denied request does not hide other balances. Reset dates are displayed only when returned by the provider. No exchange-rate conversions or estimated costs are presented as provider credit balances.

Cloud Billing → **Credits** remains the authoritative source for Google's remaining promotional balance and eligibility. For a future automated cost view, separately configure a Cloud Billing BigQuery usage/cost export and a narrowly scoped server identity that can query its dataset. Exports have reporting delay; subtracting exported costs from a screenshot's original credit amount would not establish an authoritative current promotional-credit balance. Do not reuse the model API key or browser SSO as billing authorization.

## Refresh, privacy and debugging

- Account checks use fixed read-only provider endpoints. They do not perform searches, scraping, inference or send email.
- A server-memory snapshot lasts five minutes. **Refresh usage** can request a newer snapshot, with a 30-second minimum between checks per running server instance. Concurrent requests are deduplicated; credential changes invalidate the cache.
- Auth is checked even when a snapshot is cached. HTTP responses are `private, no-store`, vary by cookie and are excluded from indexing. Nothing is stored in browser local storage.
- Credentials, raw account payloads, account emails and raw provider errors are excluded. The UI receives an explicit numeric projection only.
- Checks have a ten-second network deadline, a 65-KB response limit, no redirects and no retries. These bounds apply to lightweight balance reads, not the previously configured Gemini research benchmark.
- Owner-page WebMCP tools `mirana_admin_usage` and `mirana_admin_usage_refresh` call the same protected API. They accept only an empty object. Research agents and ordinary shopping pages are not registered with these billing tools.
- `npm run usage:status` is a local terminal diagnostic using the operator's environment credentials. It prints only normalized status/metrics and never prints keys. Network-restricted execution can report unavailable values even for valid credentials.

The cache is per server instance, not a distributed spending limit. A public launch should use shared rate/spend enforcement for research; this dashboard does not replace that enforcement.

## Verification on 10 October 2026

Read-only live account endpoints returned **250 SerpApi searches**, **995 Firecrawl credits** and **1,000 Tavily plan credits** remaining at 15:53 IST. These are a dated verification snapshot, not hardcoded dashboard values. Bright Data denied the balance read. Keepa, email and hosted Turso credentials are absent locally; the Vertex key cannot read Cloud Billing promotional credits. No model or product-search calls were started for dashboard verification.

Tests cover anonymous/nonowner/expired/legacy/unverified/preview denial, spoofed headers, cross-site requests, authorization before provider calls, credential/error projection, zero/unknown values, provider independence, response bounds, cancellation, cache rotation/deduplication/refresh throttling and WebMCP input validation. Browser QA uses an isolated database and synthetic provider responses; it does not verify a live owner Google login.

All 24 test suites passed, along with TypeScript, focused ESLint and the optimized Next.js build. Actual browser WebMCP reads and refreshes succeeded against the fixture server; switching to a nonowner immediately cleared all balances and unregistered the tools, and reloading the protected page returned its not-found screen. The 390-pixel mobile view had eight cards and no horizontal overflow. Browser warning/error logs were empty. A scan of 34 built client assets found no configured provider secrets or owner email. Temporary fixture servers were stopped after verification. No production code was pushed or deployed.

## Provider documentation

- [SerpApi Account API](https://serpapi.com/account-api)
- [Tavily Usage API](https://docs.tavily.com/documentation/api-reference/endpoint/usage)
- [Firecrawl credit usage](https://docs.firecrawl.dev/api-reference/endpoint/credit-usage)
- [Bright Data account balance and free-credit limitation](https://docs.brightdata.com/api-reference/account-management-api/Get_total_balance_through_API)
- [Keepa official token request](https://github.com/keepacom/php_api/blob/master/src/API/Request.php) and [response fields](https://github.com/keepacom/api_backend/blob/master/src/main/java/com/keepa/api/backend/structs/Response.java)
- [Google billing credits](https://docs.cloud.google.com/billing/docs/how-to/resolve-issues)
- [Cloud Billing export](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery)

For the agent/tool proposal, see [ADK_TOOL_DESIGN.md](ADK_TOOL_DESIGN.md).
