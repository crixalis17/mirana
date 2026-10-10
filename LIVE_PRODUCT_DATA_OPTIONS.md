# Live product data options for Mirana

Research date: 2026-10-08. Documentation/source review only. None of these providers has been connected, paid for or verified against live Mirana cases. Recommendations below are engineering judgments, not measured reliability rankings.

## Recommended evaluation stack

Evaluate SerpApi for India-localized product discovery, Bright Data for structured Amazon/Flipkart listing retrieval, and Keepa for Amazon.in historical prices. Use Gemini 3.8 Flash for requirements, search planning, evidence assessment and explained comparison. The model should consume retrieved records; prices, eligibility and checkout status must not depend on model assertions.

Prefer typed server-side API adapters for the scheduled backend. Expose the same capabilities as constrained tools/MCP where helpful. MCP standardizes the interface; it does not make the underlying search index or scraper fresh, comprehensive or accurate.

## Available services

| Service | Available interface and role | Access / boundaries |
|---|---|---|
| [SerpApi Shopping](https://serpapi.com/google-shopping-api), [MCP](https://serpapi.com/integrations/mcp) | Structured Google Shopping discovery, merchant links, prices and review signals. Hosted/local MCP and HTTP API. | API key required. India is documented as `gl=in`; use Chennai localization for this user's brief. Results are search evidence, not checkout receipts. [Countries](https://serpapi.com/google-shopping-countries), [result fields](https://serpapi.com/shopping-results). |
| [Bright Data MCP](https://github.com/brightdata/brightdata-mcp) and [Flipkart extraction](https://brightdata.com/solutions/data-extraction/flipkart) | Amazon product search/details and Google Shopping tools; separate Flipkart scraper API returns structured listing records. | Provider token required. There is no dedicated named Flipkart tool in the inspected list; generic `search_scrapers` / `get_scraper_details` / `run_scraper` tools can discover and execute supported scrapers, or use the API through an adapter. Distinguish on-demand retrieval from pre-collected datasets. Actual seller, postcode and bank-offer coverage needs testing. |
| [Keepa API](https://keepa.com/api-docs/product-object.html) | Existing Amazon price-history data, ASIN/variant metadata, offers and update timestamps. Amazon.in is documented as domain ID 10. | API access required. Historical/tracked data is not necessarily a current listing; examine update timestamps and retrieve the current offer separately. No Flipkart coverage established. |
| [DataForSEO Merchant API](https://dataforseo.com/apis/merchant-api) | Alternative structured Google Shopping/Amazon product, seller and review APIs. | Credentials required; use the [supported locations endpoint](https://docs.dataforseo.com/v3/merchant-google-locations/) before committing to country coverage. [Seller response](https://docs.dataforseo.com/v3/merchant-google-sellers-task_get-advanced/) includes pricing/shipping information where returned. No direct Flipkart integration established. |
| [Shopify Global Catalog MCP](https://shopify.dev/docs/agents/catalog/global-catalog) | Official cross-Shopify product discovery, lookup and variant details; shipping-location, condition and availability filters. | [Docs](https://shopify.dev/docs/agents/catalog) specify an agent profile, no API key. Current endpoint: `https://catalog.shopify.com/api/ucp/mcp`. Covers the Shopify ecosystem; does not cover Amazon/Flipkart. India assortment and postcode behavior remain untested. |
| [Firecrawl MCP](https://github.com/firecrawl/firecrawl-mcp-server) | Search and page extraction for official stores and reviews; structured extraction schemas. | General web tooling, not a unified shopper inventory service. Full production capabilities need provider access or supported self-hosting. |
| [Tavily MCP](https://github.com/tavily-ai/tavily-mcp), [Exa MCP](https://exa.ai/docs/get-started/exa-mcp) | Search and retrieval for specifications, independent reviews and user feedback. | General research tools; no verified all-retailer price/stock coverage. Hosted/local access and account/rate limits vary. |

## Official retailer APIs

- [Amazon India Creators API](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/introduction) has search, item and variation methods. Documentation requires Associates enrollment and ten qualifying sales in the past thirty days. Older [PA-API 5 is deprecated](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/paapiv5-deprecation). [OffersV2](https://affiliate-program.amazon.in/creatorsapi/docs/en-us/api-reference/resources/offersV2) assumes a default in-marketplace address; it cannot alone establish this user's final landed cost. Its governing content-use terms apply; do not treat affiliate credentials as unrestricted permission to warehouse product content. The [India agreement](https://affiliate-program.amazon.in/help/operating/agreement) separately requires written approval for price tracking/alerts in approved mobile applications; do not generalize that mobile-specific clause to Mirana's current website.
- [Flipkart Affiliate APIs](https://affiliate.flipkart.com/api-docs/af_overview.html) document search, product lookup, feeds and offers, requiring affiliate ID/token. [Keyword search](https://affiliate.flipkart.com/api-docs/af_prod_ref.html) returns at most ten products, and the documentation labels that endpoint for deprecation in favor of product feeds. New self-service enrollment could not be verified from the current registration page. No official shopper-search MCP was found in the Amazon/Flipkart documentation inspected.
- [WooCommerce Store API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/products/) exposes published product JSON for individual compatible stores without product-read API keys. It is useful for some direct retailers, not cross-web discovery.
- [ONDC](https://www.ondc.org/pages/resources-tech.html) is an existing commerce network with participant onboarding/partner integration, not an anonymous API spanning every retailer.

## Freshness and evidence

[SerpApi](https://serpapi.com/google-shopping-api) caches identical shopping queries for up to one hour unless `no_cache:true` is requested. [Firecrawl](https://github.com/firecrawl/firecrawl-docs/blob/main/features/fast-scraping.mdx) documents a default two-day scrape cache; `maxAge:0` requests fresh scraping. Cache bypass refreshes retrieval, not necessarily the retailer's indexed information or account-specific checkout conditions.

For each observation record provider, product identity, exact variant, seller, condition, currency, product price, required accessories, shipping, mandatory fees, stock, delivery region, bank/coupon conditions, source URL, provider update time, retrieval time and cache status. Unknown values stay unknown. A search result, historical tracker and current merchant listing are different evidence types.

## Existing workflow and proposed Mirana algorithm

[Bright Data's price-comparison example](https://github.com/brightdata/brightdata-mcp#price-comparison--best-place-to-buy) already describes identity matching, retailer retrieval, normalized offers and landed-cost comparison. Mirana can adapt that pattern rather than build every collector.

Proposed Mirana workflow:

1. Parse the user's product brief/link into hard constraints, preferences/custom tags and necessary accessories.
2. Search broadly, then match exact model/MPN/GTIN/ASIN and variant attributes. Never merge tablet-only and tablet-plus-stylus prices.
3. Retrieve shortlisted merchant records and product/review evidence. Exclude mismatched variants, used goods and known budget failures; preserve gaps.
4. Calculate complete cost deterministically. Keep verified unconditional cost separate from conditional SBI/coupon/EMI prices.
5. Rank constraint-qualified products by supported use-case fit, ownership costs, review evidence and user preferences. Publish top N only when enough candidates have evidence; explain #1 and tradeoffs.
6. For opted-in alerts, recheck stored exact product/variant identities. Compare against comparable historical observations (same condition/cost basis), using adequate history and category-dependent thresholds. A low historical percentile or material drop may qualify; a claimed discount from MRP alone does not.
7. Deduplicate unchanged offers and notify only when a fresh qualifying observation is supported. If history is inadequate, label that limitation rather than inventing an all-time-low claim.

These steps are our proposed algorithm. No discovered provider offers a verified turnkey replacement for Mirana's complete onboarding, personalized top N, evidence validation, price history and meaningful-alert workflow across every Indian retailer.

## Local evaluation before selection

Run the same tablet, laptop and air-purifier cases against candidate providers, including product-link inputs and negative cases (wrong capacity, missing accessory, used condition, expired coupon, old sale page, out-of-region listing). Measure exact-variant match rate, direct merchant evidence, timestamps/cache freshness, seller/stock/postcode fields, kit-cost correctness, review quality, latency, failure rate and cost per successful verified observation. Compare to Gemini Search-only results. Keep provider keys server-side and test with isolated local data; no production or email changes are part of this discovery.

Small community prototypes also exist: [MCP India Retail Intelligence](https://github.com/balaadityaai/mcp-india-retail-intelligence) searches Amazon.in/Flipkart; [ecom-extract](https://github.com/sourabhbgp/ecom-extract) extracts product URLs. They are unverified scraping implementations with limited history and should be evaluated as prototypes, not assumed production solutions.

## Local implementation status — 9 October 2026

The adapters and Gemini 3.8 Flash SDK tool loop are implemented locally and fixture-tested. SerpApi Shopping/MCP, Bright Data exact-listing API/read-only MCP, and optional Keepa API are available behind `RESEARCH_TOOLS_ENABLED`. Live provider keys are missing, so data quality and latency have not been verified. See [PRODUCT_TOOLS_SETUP.md](PRODUCT_TOOLS_SETUP.md). The canceled HIGH study stays stopped; no production or scheduled deal-refresh changes have been deployed.
