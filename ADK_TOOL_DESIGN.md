# Mirana research agent and tool design

Local migration implemented on 10 October 2026 with pinned `@google/adk@2.2.1`. No production jobs, deployment, cron changes or email delivery are activated. The stopped model benchmark remains stopped.

## Implemented architecture

Mirana now runs **TypeScript ADK inside the existing research worker**, keeping `gemini-3.8-flash` and direct Google Cloud/Vertex serving. Reuse the existing validated provider adapters, evidence ledger, Turso checkpoints and alert verifier. Change the orchestration layer first; adding more independently reasoning agents should depend on evidence that they improve recommendation quality.

Google provides official TypeScript ADK (`@google/adk`) and Python ADK (`google-adk`). TypeScript reuses Mirana's existing Node worker and typed tools. The TypeScript quickstart currently requires Node 24.13.0+ and npm 11.8.0+; The package is pinned at 2.2.1 and Mirana now requires Node 24.13.0+. Local verification used Node 25.4.0; installation and tests also passed with the existing npm 11.7.0. Use the documented npm version for a fresh setup. [Official TypeScript quickstart](https://adk.dev/get-started/typescript/).

ADK supports deterministic sequential, parallel and loop workflow agents. The current documentation describes newer ADK 2.0 graph workflows specifically for Python and Go; do not assume those APIs exist in TypeScript. We can preserve Mirana's own stage machine instead of depending on that feature. [Official workflow documentation](https://adk.dev/agents/workflow-agents/).

This aims for an iterative, evidence-driven research experience. It does not reproduce Google's proprietary Deep Research algorithm, and a framework change alone does not improve source quality or make provider prices verified checkout offers.

## What Mirana already does

`lib/research/tool-agent.ts` constructs an ADK `LlmAgent` and executes it through a `Runner`: Gemini selects registered search, listing and extraction tools, inspects their results and makes subsequent calls. The former AI SDK `ToolLoopAgent` is replaced. Tool registration happens in code, not because a provider key or an IDE MCP server exists.

The existing persisted flow is:

```text
free-form requirement / exact product link
  → plan → gather → read → assess
                 ↑         ↓
                 └ followup for unresolved gaps
  → synthesize → deterministic verify → publish top N and #1
```

With `RESEARCH_PROVIDER=vertex` and `RESEARCH_TOOLS_ENABLED=true`, planning, assessment and synthesis also use ADK agents with strict structured output. Gather/follow-up use ADK function tools. Tools-disabled legacy provider routes remain unchanged and do not silently opt into ADK. Reading, verification and publication retain deterministic code. The current tool path is explicitly local-only; configured credentials are not proof of a released production agent.

## Tool registry to reuse

These existing contracts are registered as ADK function tools; their executors remain the authority for validation, fixed provider endpoints and provenance. ADK TypeScript supports `FunctionTool` with a name, description, parameter schema and executable function. [Official function tool documentation](https://adk.dev/tools-custom/function-tools/).

| Existing tool | Service / transport | Use in the research flow |
| --- | --- | --- |
| `search_products_india` | SerpApi Google Shopping India API | Discover candidate products and retailer leads. Search-result prices remain provisional. |
| `fetch_product_listing` | Bright Data scraper API | Read a discovered exact Amazon.in or Flipkart listing, keeping exact SKU and provider JSON provenance. |
| `amazon_price_history` | Keepa API, Amazon India domain | Compare history for an exact ASIN when configured. History does not establish current stock. |
| `search_web_tavily` | Tavily REST API | Targeted discovery of official specifications, independent reviews and owner feedback. |
| `read_source_tavily` | Tavily REST API | Retrieve literal page text for an approved source. |
| `search_web_firecrawl` | Firecrawl MCP | Alternative discovery when another provider leaves a specific evidence gap. |
| `read_source_firecrawl` | Firecrawl MCP | Extract an approved page when direct reading is blocked or insufficient. |
| `read_source_page` | Mirana's direct page reader | Read approved original official, retailer, review or owner sources without credentials or cookies. |
| `search_web_mcp` / `read_source_mcp` | Restricted SerpApi / Bright Data MCP wrappers | Additional discovery/extraction leads, retaining their distinct trust level. |
| `google_search` | Gemini built-in grounding | Additional discovery where supported by the exact chosen model and ADK serving path. |

`adk-tools.ts` derives strict runtime validation from the existing provider definitions. All function tools use this factory and deduplicate normalized arguments within one invocation. Their executors still enforce endpoint, SKU and provenance checks. No duplicate SDK registry is retained. Unavailable tools return explicit unavailable status; missing Keepa is an evidence limitation, never invented price history. Tools receive owner/job IDs and cancellation from trusted worker context, not model arguments.

ADK can consume MCP toolsets, but initial migration should wrap Mirana's existing restricted executors rather than import every tool advertised by a remote server. Preserve read-only names, connection cleanup, response bounds and secret redaction. IDE OAuth/MCP configuration is separate from a deployed app's credentials. [Official MCP documentation](https://adk.dev/tools-custom/mcp-tools/).

## Reasoning stages

The implementation uses one tool-using research agent plus isolated structured stage agents and deterministic stages. If role separation proves useful, use the same `gemini-3.8-flash` model for every model-based role; no silent model fallback or `latest` alias.

1. **Planner:** Interpret category, explicit hard requirements, softer preferences/custom tags, budget including required accessories, location, condition and requested top N. Produce questions and an investigation plan rather than an early recommendation.
2. **Discovery researcher:** Choose targeted search tools. Begin with official India stores, Amazon India and Flipkart, then relevant reputable retailers. Return exact candidate identities and source leads.
3. **Evidence researcher:** Read shortlisted sources and identify specifications, compatible accessories, dated prices, measured review results and owner anecdotes. Run independent source requests concurrently only within shared provider/job limits.
4. **Assessment and follow-up:** Detect contradictions and missing evidence. Investigate only gaps likely to affect the recommendation. Stop when enough evidence exists, the remaining gap cannot be verified, cancellation arrives, or the configured research budget is reached.
5. **Comparator:** Rank candidates against this user's explicit criteria and explain pros, cons and trade-offs. Return fewer than N if N cannot be supported. Identify #1 with the remaining uncertainties beside it.
6. **Deterministic verifier/publisher:** Validate schemas, quote ranges/content hashes, source dates, exact variants, currency, mandatory costs and India retailer identity. The model cannot grant checkout verification or independently publish an eligible deal alert.

An ADK model/tool callback is a useful hook for shared quotas and telemetry, but the checks must also live in executors so non-ADK callers receive the same enforcement. [Official callback documentation](https://adk.dev/callbacks/types-of-callbacks/).

## Persistence, cost and privacy

Turso jobs and leases remain the source of truth. `adk-runtime.ts` creates an isolated in-memory ADK session for each stage invocation and deletes it afterward. Retry reconstructs input from Mirana's saved plan, discovery, source and assessment checkpoints. ADK event transcripts and hidden thoughts are not written to Turso. An unfinished stage may replay after a crash; within-stage exactly-once recovery is not claimed. Store owner/job/brief revision, completed stage outputs, bounded source snapshots, claim proofs, usage events and cancellation state. Map ADK session identity to the owned job; never use shared cross-user state. ADK sessions model events and state, but in-memory example sessions are insufficient for worker restart recovery. A custom durable session adapter or checkpoint reconstruction must be tested; no built-in Turso integration is assumed. [Official session documentation](https://adk.dev/sessions/session/).

Deduplicate canonical tool name + validated arguments + locale + exact variant per research run. Reuse successful persisted snapshots across resumes with explicit age. Cache stable specifications longer than prices; use a deliberately fresh exact-listing check for an alert. Avoid sending every query to every provider. An interrupted already-dispatched request can still be billed, and replay after a crash may bill again unless the provider supports idempotency.

Reserve model attempts, token estimates and external tool calls before dispatch. Record actual returned input/output/thinking usage where available, provider status, tool duration, cache hit and retry count. Preserve unknown usage for failed calls; do not present estimates as the provider's invoice. Allow deliberately generous local testing settings separately from public per-user and global budgets. Keep network/resource bounds and cancellation so a public request cannot spend indefinitely.

The owner dashboard should distinguish provider-reported balance, provider quota, Mirana-recorded usage and estimated cost. A fresh available credit balance can help apply a configured minimum reserve; unavailable/stale balances cannot prove remaining spend. Decide explicit fail-closed behavior for public research where a provider's spending reserve is mandatory. API credit units and money are not interchangeable. Account balances may include other applications.

Billing/usage endpoints, API keys, admin access and email delivery are **not research-agent tools**. The agent receives only job-scoped research tool readiness and safe errors. Admin usage remains restricted to the server-verified owner identity. No provider balance or owner email belongs in ordinary user research prompts, results or public WebMCP capabilities.

Keep Google serving on the project's direct Cloud endpoint. `adk-model.ts` implements ADK's `BaseLlm` using the existing project-bound Vertex endpoint and `x-goog-api-key`. ADK's built-in Vertex client uses ADC, so the custom adapter preserves the existing credential method and serving path. Verify project, endpoint, exact model support and credential method in a local contract test before a live ADK request; API-key credentials and Google Cloud IAM are different scopes. ADK supports Gemini and Google Cloud authentication, but model/framework support does not establish promotional-credit eligibility. [Official Gemini/Cloud authentication documentation](https://adk.dev/agents/models/google-gemini/).

Model inference, grounding, scraping/search providers, storage, hosting and email can incur separate charges. A framework does not pool credits between them or use a ChatGPT Plus allowance. No provider should silently switch from keyless/free access to paid access.

## Deal checks after research

Run opted-in due checks against saved exact product variants and listing URLs. Use listing adapters and observed history instead of repeating broad research or asking an agent whether to send email. Deterministic code must independently check current consent, user-selected cadence, offer eligibility, complete kit cost, target/history threshold, expiry and deduplication immediately before delivery to the verified account address. Unchanged or unqualified offers send no email.

Cadence UI remains daily/12-hour/custom with honest dispatcher limits. ADK does not supply a production scheduler or make Vercel Hobby run every 12 hours. Keep independently authenticated worker dispatch and owner-scoped jobs.

## Verification and remaining work

Implemented and fixture-verified:

- Actual ADK model → function tool → model continuation, strict parameters, normalized duplicate calls, fixed Vertex endpoint, HIGH thinking, Google Search declarations and 65,536-token explicit test allowance.
- Structured ADK planning/assessment/synthesis routing, strict schema checks, opaque function signatures and removal of hidden thought text.
- Real worker checkpoints, restart without replaying completed planning, source snapshot reuse, owner isolation, cancellation, stale-brief fences and per-dispatch model/tool budgets.
- Invalid/private URL rejection, schema-invalid outputs, invented quote rejection, unavailable providers, rate/quota errors and cancellation during response reads.
- ADK message-content tracing and raw framework logging disabled. A model-error plugin preserves original safe provider/budget/lease exceptions rather than ADK's generic error events. Existing Mirana logs remain authoritative.

`npm test` includes 27 suites, including three ADK suites; all passed, as did TypeScript, focused ESLint and the optimized build. A scan of 47 client assets found none of the configured provider credentials or owner email.

The explicit live check `npm run research:smoke:adk -- --live` passed on 10 October 2026: Gemini 3.8 Flash with HIGH thinking completed two model turns, called `search_products_india` once and returned two discovery sources in 26.4 seconds. It consumed 15,675 input tokens, 118 output tokens and 488 thinking tokens. This check does not access the database or send alerts and is separate from the stopped benchmark. Google Search was registered but was not invoked in this run. The returned Google Shopping leads do not establish merchant checkout prices.

Live verification exposed an oversized Shopping response. The adapter now requests a bounded provider-side field projection that omits images and unrelated metadata while retaining discovery fields. An independent check of the final projection returned 24,444 bytes, two discovery leads and zero merchant offers; the existing 300 KB response guard remains intact.

Local HTTP and WebMCP checks passed at `http://127.0.0.1:5176`: the app loads, unauthenticated research/admin requests return 401, and configuration/session tools report their actual state. Local Google OAuth client credentials are absent, so signed-in browser research still needs a live check after local OAuth setup; isolated authenticated worker/session tests cover that path in the meantime.

Dependency review updated Next.js to 16.3.8 and patched the affected YAML/WebSocket packages. The resulting audit has no critical findings but still reports 17 dependency findings (1 low, 7 moderate, 9 high). Review those remaining dependencies before a public release; this is not a clean dependency audit.

Recommendation quality, complete purchase checkout, all-provider live parity and production scheduling remain separate verification tasks. Keep localhost until an explicit release. The existing public worker limits remain; this migration introduces no new inference deadline and does not change the previously generous stopped benchmark settings.

## Approved production activation

On 10 October 2026 the user explicitly authorized a production release, saved-key transfer and research access for all signed-in Google users. `RESEARCH_PRODUCTION_ENABLED=true` enables the same validated ADK tools in production; without it the runtime remains disabled. New jobs have shared rolling-24-hour defaults of 3 per user and 10 globally; existing jobs keep their immutable per-job budgets across retries. The additive research schema bootstrap creates only missing job tables/indexes and preserves existing shopping/auth records. Deal checks now use a fixed daily schedule at approximately 10 AM IST, with no 12-hour/custom UI. Brand and model name are required on new requests; other fields remain optional. Live release verification is recorded in RELEASE_VERIFICATION.md.
