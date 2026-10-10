# Local product research tools

Mirana's local Vertex research path lets **Gemini 3.8 Flash** choose tools during discovery and follow-up. Planning, quote assessment and synthesis now run as structured ADK stages against the same Vertex endpoint, with Gemini 3.8 Flash and HIGH thinking. See [ADK_TOOL_DESIGN.md](ADK_TOOL_DESIGN.md). The stopped benchmark remains stopped. On 2026-10-10, Tavily keyless search and extraction passed live checks. Firecrawl anonymous requests were denied; the subsequently supplied session API key passed live MCP search (six sources) and literal page extraction (12,000 stored characters). The source URL check accepts a single terminal-slash change while retaining the same origin, full path and query. A live ADK → SerpApi shopping search → ADK continuation also passed with two model turns, one tool request and two discovery leads. Bright Data/Keepa adapters and the complete purchase workflow retain fixture coverage; live checkout and recommendation quality are not established by these checks.

## Keys to add

Edit `.env.local` in this directory. This ignored, permission-restricted file stays on the server. Do not paste credentials in chat, use `NEXT_PUBLIC_` keys, or commit this file.

1. Create a [SerpApi account](https://serpapi.com/) and copy the API key from its [API-key dashboard](https://serpapi.com/manage-api-key) to `SERPAPI_API_KEY`. This enables India Google Shopping discovery and the [hosted SerpApi MCP](https://serpapi.com/integrations/mcp) for review/web searches. Both use the same account quota. Mirana bypasses the search cache, but a search price remains provisional.
2. Create a [Bright Data account](https://brightdata.com/) and add its API token to `BRIGHT_DATA_API_TOKEN`. In the Web Scraper API library, choose **Amazon product** and **Flipkart product** scrapers. Copy their dataset IDs (`gd_…`) into `BRIGHT_DATA_AMAZON_DATASET_ID` and `BRIGHT_DATA_FLIPKART_DATASET_ID`. Confirm each selected scraper accepts the India product URL and returns that same exact listing; Mirana rejects mismatched IDs/URLs. Its synchronous request may return a pending snapshot rather than records. Mirana records this as unavailable evidence and does not poll or retry automatically.
3. `KEEPA_API_KEY` is optional. An active [Keepa API subscription](https://keepa.com/api-docs/plans-tokens.html) enables Amazon India price history for an exact ASIN. Leave it blank initially. Historical observations never prove today's stock or checkout price.
4. **Tavily** is prepared with `TAVILY_ACCESS_MODE=keyless`, using its [documented keyless search/extract API](https://docs.tavily.com/documentation/keyless). No key is needed for the locally verified limited access. For higher account limits, add a key from [Tavily's dashboard](https://app.tavily.com/) to `TAVILY_API_KEY` and explicitly set `TAVILY_ACCESS_MODE=keyed`. Keyless mode ignores saved keys and does not switch to paid access on failure.
5. **Firecrawl** uses its [hosted MCP](https://docs.firecrawl.dev/mcp-server/keyless) at `https://mcp.firecrawl.dev/v2/mcp`. `.env.local` now has `FIRECRAWL_ACCESS_MODE=keyed` and the user-supplied session credential in `FIRECRAWL_API_KEY`, with live search/read verified. For a fresh setup, create an account/key through [Firecrawl](https://www.firecrawl.dev/) and paste it into that field. Existing account credits/limits apply; do not enable a paid plan merely to connect. Without the key, its tools are omitted from Gemini's available tools. `keyless` is still an explicit supported mode if anonymous access becomes available; `disabled` turns either provider off.

SerpApi and Bright Data have separate plans and allowances; verify their dashboards before using them. Bright Data MCP search/page extraction and Scraper API records can have different billing. Google Cloud credits do not pay these companies. These integrations do not start paid subscriptions.

Keep the existing server-side `GOOGLE_API_KEY` and `GOOGLE_CLOUD_PROJECT`. When ready, set:

```dotenv
RESEARCH_PROVIDER=vertex
GEMINI_RESEARCH_MODEL=gemini-3.8-flash
RESEARCH_TOOLS_ENABLED=true
RESEARCH_MAX_TOOL_CALLS=12
```

No alternate model fallback is configured. The tool path requires explicit `RESEARCH_PRODUCTION_ENABLED=true` in production. The user approved activation for all signed-in users on 10 October 2026; per-user/global daily job limits and per-job budgets are enforced in the shared database. Missing service credentials return explicit limitations; they do not silently substitute trained knowledge for verified listing data.

## Check and run

From this directory:

```sh
npm run tools:status
```

This prints configuration/readiness only and makes **no network requests**. Readiness does not establish live access. Keepa can remain false. The local env enables research tools, Tavily keyless and Firecrawl keyed; no worker or queued jobs are started by this setup.

An explicit provider smoke check runs one search and one source extraction, without model calls, jobs, database writes or email:

```sh
npm run tools:smoke:web -- tavily
npm run tools:smoke:web -- firecrawl
```

The second command needs the Firecrawl key in this environment. Keyed smoke requests consume the selected account's credits. Diagnostics print counts, timing, trust type and safe error codes; they omit keys and source bodies.

The separate, explicit ADK runtime check uses two model turns and requests one shopping search without database writes or email:

```sh
npm run research:smoke:adk -- --live
```

It passed locally in 26.4 seconds. Shopping responses now use a provider-side field projection to remove images and unrelated metadata; the final projection was independently checked at 24,444 bytes. Google product pages remain discovery leads with no invented merchant URL or verified checkout price.

Restart the localhost app after changing environment variables, and use a separate local SQLite database for testing. Run migrations against that local file first. Start `npm run worker:local` only when ready to invoke the model and product providers: it resumes queued jobs and can incur usage. Stop it with Ctrl+C. Submit one new shopping item via the normal UI or authenticated WebMCP tool. Set model/token/round limits for the whole job in `.env.local`; each ADK generation and external tool request is counted before dispatch, including failed requests. Retries retain counters. The local worker remains bounded by its stage/job limits; the previously uncapped HIGH benchmark stays stopped.

Research logs expose hashed job IDs, stages, tool/provider names, counts, latency and token usage; they never print keys, page bodies or hidden reasoning. Review logs alongside the app's progress/errors. Look for `model-call`, `tool-call`, `completed` and `failed` events.

## How results are used

- Google Search, SerpApi, Tavily and Firecrawl discover official stores, Indian retailers and review/owner sources. Tavily basic search disables generated answers; Firecrawl search requests no automatic page scraping. Choose targeted tools to close a gap, rather than duplicating every query across providers.
- Direct reads, Tavily literal `raw_content` and Firecrawl literal `markdown` use the same approved source-host list. Provider summaries, generated answers and unapproved/redirected source URLs do not enter the quote ledger. Firecrawl requests `maxAge=0`; cache/freshness remains unverified. Tavily's extraction has no query-based chunk reranking, preserving literal source text.
- Provider extracts retain their tool, fixed endpoint, requested URL, retrieval time, response hash and bounded text hash. They reach the saved gather/read/assess stages, support provisional literal quotes and are reused instead of fetched again. Original page text still takes precedence. Independently measured claims require a directly read review with test methodology.
- Bright Data API extracts one exact Amazon India or Flipkart listing. A field projection keeps literal SKU/price/currency/condition/stock values, provider timestamp, response hash and source provenance. These may support provisional claims, not verified checkout.
- Search snippets, arbitrary MCP output and Keepa history cannot become current merchant-price evidence. Bright Data MCP page text supplies discovery leads; registered Firecrawl/Tavily extraction has separate literal-page provenance.
- Original merchant text takes precedence over API projection. A blocked later read does not erase earlier readable evidence. Quote text is bounded and hashed after truncation.
- Ranking still applies the user's use case, budget including required accessories, preset priorities and custom tags. Unknown seller, postcode delivery, mandatory accessories, bank eligibility or total cost stays unknown.

Only fixed read-only search and single-page extraction schemas are exposed, never remote manifests, actions, crawl, browser interaction or another provider's research/model agents. Access failures have no automatic retries or paid fallback. The daily deal-refresh/email path is unchanged; provisional provider prices alone cannot trigger an email. No production deployment, cron update or email delivery has been performed.
