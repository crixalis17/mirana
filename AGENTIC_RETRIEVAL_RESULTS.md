# Agentic retrieval test results

Local washing-machine test completed on 2026-10-11T09:25:05.618Z. No assessment, ranking, recommendation, shopping-list update or email was run. No deployment was made.

**Conclusion:** Gemini can construct search queries, choose the registered external tools, consume returned API data and request exact listing URLs through ADK. This is a retrieval capability pass, not proof that every query or product qualification is correct.

## Observed listings

| Provider listing | Model / title | Extracted INR price | Budget evidence |
|---|---|---:|---|
| [B0CMZHRF3M](https://www.amazon.in/dp/B0CMZHRF3M) | Whirlpool 8 Kg 5 Star Stainwash Royal Plus Fully Automatic Top Load Washing Machine (SW ROYAL PLUS H 8 KG GREY 10YMW with In-Built Heater) | 20490 | Within 22000 |
| [B0DGLPJ1MB](https://www.amazon.in/dp/B0DGLPJ1MB) | Whirlpool 8 Kg, 5 star, 5 MAGIC CLEAN PRO SW H Fully Automatic Top Load Washing Machine (MAGIC CLEAN PRO SW H KG GREY 10YMW with In-Built Heater) | Unknown | Unverified |
| [itm3f2e27bd2793d](https://www.flipkart.com/whirlpool-8-kg-fully-automatic-top-load-washing-machine-in-built-heater-grey/p/itm3f2e27bd2793d) | Whirlpool 8 kg Fully Automatic Top Load with In-built Heater Grey (Stainwash Pro H 8.0 Grey) | 19345 | Within 22000 |
| [itm5ba73e627e8e8](https://www.flipkart.com/lg-8-kg-fully-automatic-top-load-washing-machine-black/p/itm5ba73e627e8e8) | LG 8 Kg Fully Automatic Top Load Black (T80KMMB3Z) | 18452 | Within 22000 |
| [B0DPHTSTYJ](https://www.amazon.in/dp/B0DPHTSTYJ) | LG 8 Kg 5 Star Smart Inverter Technology Fully Automatic Top Load Washing Machine (T80VBMB4Z, Turbodrum, Auto Prewash, Stainless Steel drum, LED Display, Smart Diagnosis, Middle Black) | Unknown | Unverified |

Prices are literal third-party extraction, not verified checkout totals or postcode stock. The Whirlpool Royal Plus extraction includes the words “ZPF Technology”; its actual pressure tolerance and Chennai service quality remain unverified. Bank eligibility and card discounts are not verified.

## Actual Gemini tool inputs

- `search_products_india`: {"query": "8 kg top load fully automatic washing machine", "location": "Chennai, Tamil Nadu, India"}
- `search_web_tavily`: {"query": "site:amazon.in \"Whirlpool\" 8 kg top load washing machine"}
- `fetch_product_listing`: {"url": "https://www.amazon.in/Whirlpool-Stainwash-SW-ROYAL-PLUS/dp/B0CMZHRF3M"}
- `fetch_product_listing`: {"url": "https://www.amazon.in/Whirlpool-Fully-Automatic-Washing-Machine/dp/B0DGLPJ1MB"}
- `search_web_tavily`: {"query": "site:flipkart.com \"8 kg\" \"top load\" washing machine \"fully automatic\""}
- `fetch_product_listing`: {"url": "https://www.flipkart.com/whirlpool-8-kg-fully-automatic-top-load-washing-machine-in-built-heater-grey/p/itm3f2e27bd2793d"}
- `fetch_product_listing`: {"url": "https://www.flipkart.com/lg-8-kg-fully-automatic-top-load-washing-machine-black/p/itm5ba73e627e8e8"}
- `search_web_tavily`: {"query": "site:whirlpoolindia.com \"8 kg\" \"top load\" washing machine"}
- `search_web_tavily`: {"query": "site:lg.com/in \"8 kg\" \"top load\" washing machine"}
- `read_source_tavily`: {"url": "https://www.lg.com/in/laundry/top-loading-washing-machines/t80kmmb3z"}
- `read_source_firecrawl`: {"url": "https://www.lg.com/in/laundry/top-loading-washing-machines/t80kmmb3z"}
- `search_web_tavily`: {"query": "\"T80KMMB3Z\" price OR \"water pressure\" OR \"heater\""}
- `fetch_product_listing`: {"url": "https://www.amazon.in/LG-Technology-Automatic-T80VBMB4Z-Turbodrum/dp/B0DPHTSTYJ"}
- `search_products_india`: {"query": "Godrej 8 kg top load washing machine", "location": "Chennai, Tamil Nadu, India"}
- `search_products_india`: {"query": "Samsung 8 kg top load washing machine", "location": "Chennai, Tamil Nadu, India"}

## Defects found and local fixes

- First run: removing tool declarations at the limit caused subsequent tool replay and `Function not found in toolsDict`. Final text turns now explicitly disable function calling; the experiment stops on actual tool receipts without a final model summary. Mock tests cover both boundaries.
- Second run: eight model turns were insufficient to retrieve and finish. The local experiment now permits sixteen model turns and twenty-four tool calls, while keeping normal defaults. The final live run stopped after fifteen model turns and fifteen tool invocations.
- Planning incorrectly made fully automatic operation mandatory. The tightened planning prompt preserved it as open in the final live plan. Some actual queries still explore fully automatic machines; this run did not exhaust the semi-automatic market.
- LG India official pages were blocked by our application allowlist before extraction APIs could execute. Exact LG India and Whirlpool India sources are now approved, with lookalike-domain and foreign-market regression checks. A separate post-fix extraction check is recorded below.
- Two Amazon extractions still lacked normalized current prices. Those listings stay unknown; no assumed price is generated from MRP or discounts.

## Remaining limits

- No retrieved evidence establishes reliable Chennai service or the exact variable-pressure tolerance of every candidate.
- No shortlist or winner has been produced.
- Search results may contain unrelated leads. Exact listing extraction improved identity evidence, but no prompt guarantees correct retrieval.
- The final run reported 670976 retrieval input tokens across repeated ADK context turns. Provider payload projection and context management need optimization before public-scale use.

## Verification

Passed: TypeScript, ESLint for the changed agent and experiment scripts/tests, query passthrough/result-feedback tests, retrieval-only early-stop test, existing ADK model/structured/worker/tool-agent tests, and source allowlist tests.

Raw receipts: `/private/tmp/mirana-agentic-retrieval.json`. Earlier runs: `/private/tmp/mirana-agentic-retrieval-first.json` and `/private/tmp/mirana-agentic-retrieval-second.json`. These artifacts contain no credentials and are outside source control.

## Official-page extraction after allowlist fix

After the allowlist fix, both `read_source_tavily` and `read_source_firecrawl` succeeded for `https://www.lg.com/in/laundry/top-loading-washing-machines/t80kmmb3z`, returning the title “Shop 8KG Top Load Washing Machine - T80KMMB3Z | LG India” and 12,000 characters of page text each. This checks the fixed adapters directly; the full Gemini flow was not rerun after this final allowlist change.

Linting the shared `lib/research.ts` also reports two pre-existing `no-explicit-any` violations in its JSON alias and legacy JSON-LD collector. The new allowlist code has no such violation.
