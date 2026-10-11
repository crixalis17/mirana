# Apple Watch agentic retrieval comparison

Final live run: 2026-10-11T09:38:40.350Z to 2026-10-11T09:41:46.046Z. Local test only. Gemini 3.8 Flash, HIGH thinking, 65,536 output-token ceiling, built-in Google Search disabled. Assessment, ranking, recommendations, database writes and alerts did not run.

## Verdict

**Core retrieval passed after prompt refinements. Overall superiority is not established.** The final agent independently rediscovered the known-good Series 11 Amazon ASIN and a compact Jet Black Series 10 Flipkart listing, without receiving either reference URL or ASIN. It used official catalog evidence, model-chosen search queries, exact listing extraction and adaptive page extraction to recover a price missing from Bright Data. This improves adaptive verification; the last controlled implementation already found both generations and is substantially less model-intensive.

## Original brief

I want Apple Watch 42mm (or whatever the smallest size is). I want black colour variant with GPS only, no cellular. Payment in INR and I have no bank cards to avail offers. Maximum budget is INR 40,000. Only new products.

Postcode: 600019. No generation restriction. No black-band requirement was added. Midnight/Space Gray remain unaccepted alternatives, not strict black matches.

## Factual retrieval results

| Listing | Exact observed variant | Observed unconditional price | Evidence |
|---|---|---:|---|
| [Amazon B0FQG8R2XW](https://www.amazon.in/dp/B0FQG8R2XW) | Series 11 GPS, 42mm, Jet Black, Black Sport Band M/L | ₹34,499 | Bright Data identity and in-stock flag; matching Tavily text; Firecrawl exact page says “Without Exchange 34,499.00”. Bright Data current-price field stayed null. |
| [Flipkart SMWH4JBWVH52G6DN](https://www.flipkart.com/apple-watch-series-10-gps-42mm-jet-black-aluminium-sport-band/p/itm186d892337bc4?pid=SMWH4JBWVH52G6DN) | Apple Watch Series 10 GPS 42mm Jet Black Aluminium with Sport Band (Jet Black Strap, Free Size) | ₹29,999 | Bright Data exact requested listing; seller SuperComNet. Independent page check below. |

These are core specification/price matches, not fully verified purchase offers. New-condition proof, postcode-specific delivery, complete checkout costs and return eligibility remain unresolved in the normalized fields. No winner was selected. Different band sizes of the same Watch are not different product generations.

## Mismatches and unknowns

- Flipkart Series 11 42mm Jet Black: ₹42,999, above ₹40,000.
- Flipkart Series 12 GPS 42mm Black: ₹55,900, above ₹40,000.
- Amazon Series 12 GPS 42mm: Bright Data price unknown; Firecrawl exact page says “Without Exchange 56,900.00”, above budget.
- Amazon Series 11 S/M band ASIN B0FQFB3JPD: identity/in-stock flag returned, normalized current price unknown in the final run. The preceding run independently extracted ₹34,499 for this SKU; do not silently carry that old receipt into this final run.
- Earlier runs returned Midnight SE alternatives and a 44mm SE listing. Midnight is not silently accepted as Black; 44mm is not the requested compact size.

## Comparison with previous methods

| Check | Earlier original agent | Last controlled retrieval | Refined agentic run |
|---|---|---|---|
| Known-good Amazon ASIN | Missed; explored a different SE ASIN | Independently found B0FQG8R2XW | Independently found B0FQG8R2XW |
| Two compact Jet Black generations | Incomplete/mismatched results | Series 11 and Series 10 | Series 11 and Series 10 |
| Query/provider decisions | Model-selected, problematic planning | Fixed application retrieval queries/provider routing | Gemini queries and tool calls, guided by plan and coverage instructions |
| Missing API price | Known extraction gaps | Literal API evidence available in recorded successful run | Model requested Tavily/Firecrawl; literal Firecrawl price recovered |
| Resource use | Not a comparable isolated benchmark | Four model generations across complete research; 24 provider operations | 23 retrieval model generations plus one planning generation; 23 tool invocations; 1,313,914 reported cumulative retrieval input tokens |

Baseline sources: [CONTROLLED_RETRIEVAL.md](./CONTROLLED_RETRIEVAL.md) and [PRODUCT_LISTING_AUDIT.md](./PRODUCT_LISTING_AUDIT.md). Baselines are historical, not a same-time rerun; prices changed between observations. The lower Series 10 price cannot be attributed to the algorithm. The reported input-token count is cumulative usage metadata, not a measured invoice; caching/billing effects are not assessed.

## Refinements tested

1. Initial run recovered Series 10 at ₹29,999 but focused on SE/Midnight and softened colour in the plan. It used 15 retrieval model turns.
2. Explicit colour/connectivity requirements were preserved as hard constraints; generation diversity and discounted retailer coverage were added. Second run rediscovered the exact Amazon reference and literal price, but spent too many calls on duplicate catalog/band variants.
3. Final instructions prioritized other generations and retailers over duplicate band sizes, kept the original brief above the plan, and reused exact canonical listing URLs for extraction. The final run recovered both strict core matches. Duplicate/wasted queries still occurred, so further efficiency work is needed.

## Actual final agent tool inputs

- `search_web_tavily`: {"query": "Apple India official store Watch models lineup buy"}
- `read_source_tavily`: {"url": "https://www.apple.com/in/watch"}
- `read_source_tavily`: {"url": "https://www.apple.com/in/shop/buy-watch/apple-watch"}
- `search_web_tavily`: {"query": "site:apple.com/in \"Apple Watch SE\" buy"}
- `search_products_india`: {"query": "Apple Watch 42mm black GPS", "location": "India"}
- `search_web_tavily`: {"query": "site:amazon.in \"Apple Watch\" \"GPS\" \"Jet Black\" OR \"Black\" \"42mm\""}
- `search_web_tavily`: {"query": "site:amazon.in \"Apple Watch\" \"GPS\" \"42mm\" \"Jet Black Aluminium Case with Black Sport Band\""}
- `search_web_firecrawl`: {"query": "site:amazon.in \"Apple Watch Series 11 GPS 42mm Jet Black Aluminium Case with Black Sport Band\""}
- `fetch_product_listing`: {"url": "https://www.amazon.in/Apple-Watch-Black-Aluminium-Sport/dp/B0FQG8R2XW"}
- `read_source_tavily`: {"url": "https://www.amazon.in/dp/B0FQG8R2XW"}
- `read_source_firecrawl`: {"url": "https://www.amazon.in/dp/B0FQG8R2XW"}
- `search_web_tavily`: {"query": "site:flipkart.com \"Apple Watch\" \"GPS\" \"40mm\" OR \"41mm\" OR \"42mm\" \"Black\" OR \"Midnight\" OR \"Jet Black\""}
- `fetch_product_listing`: {"url": "https://www.flipkart.com/apple-watch-series-12-gps-42mm-black-aluminium-case-sport-band-s-m/p/itm26c6e80ca105a?pid=SMWHR2GDVESV6VSP"}
- `fetch_product_listing`: {"url": "https://www.flipkart.com/apple-watch-series-11-gps-42mm-jet-black-aluminium-case-sport-band-s-m/p/itmde93b62877932"}
- `search_web_tavily`: {"query": "site:amazon.in \"Apple Watch Series 10\" \"GPS\" \"42mm\" \"Jet Black\""}
- `search_web_firecrawl`: {"query": "site:amazon.in \"Apple Watch Series 12 GPS 42mm\" \"Black Aluminium\""}
- `fetch_product_listing`: {"url": "https://www.amazon.in/Apple-Watch-GPS-42mm-Smartwatch/dp/B0HJ9VT4RS"}
- `read_source_firecrawl`: {"url": "https://www.amazon.in/dp/B0HJ9VT4RS"}
- `search_web_tavily`: {"query": "site:amazon.in \"Apple Watch SE\" \"GPS\" \"40mm\" \"Midnight\" OR \"Black\""}
- `fetch_product_listing`: {"url": "https://www.amazon.in/dp/B0FQFB3JPD"}
- `search_products_india`: {"query": "Apple Watch Series 10 GPS 42mm Jet Black", "location": "India"}
- `search_web_tavily`: {"query": "site:flipkart.com \"Apple Watch\" \"GPS\" \"41mm\" OR \"40mm\" OR \"42mm\""}
- `fetch_product_listing`: {"url": "https://www.flipkart.com/apple-watch-series-10-gps-42mm-jet-black-aluminium-sport-band/p/itm186d892337bc4?pid=SMWH4JBWVH52G6DN"}

## Verification and limits

Passed: experiment syntax, focused ESLint, TypeScript, ADK query passthrough/result-feedback tests, retrieval-only stopping test, known-reference leakage check and existing tool-agent tests. No production deployment occurred.

Raw latest receipts: `/private/tmp/mirana-agentic-watch-retrieval.json`; prior runs: `/private/tmp/mirana-agentic-watch-retrieval-first.json` and `/private/tmp/mirana-agentic-watch-retrieval-second.json`. Full provider page text in these local artifacts is untrusted evidence. The agent did not use browser/screen automation.

## Independent Flipkart page check

Firecrawl successfully extracted the exact Series 10 Flipkart URL after the agent stopped. It corroborated the 42mm GPS Jet Black title, ₹29,999 base price and seller SuperComNet. The page also displayed a ₹149 Protect Promise Fee: base plus that displayed fee is ₹30,148, before any unverified delivery/checkout charges. Lower figures such as ₹28,024 rely on payment offers and are not used for this no-bank-card brief.

The variation menu labels the selected 42mm product-ID link “Out of stock”; the normalized Bright Data availability field is null. That availability ambiguity must be resolved for postcode 600019 before treating this as a currently purchasable deal. This independent operator audit was not added to the agent session. Its full source/provenance snapshot is saved at `/private/tmp/mirana-watch-listing-verification.json`.
