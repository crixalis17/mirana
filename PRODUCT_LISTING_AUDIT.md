# Apple Watch listing audit — 10 October 2026

Scope: the saved production Apple Watch research job, maximum INR 40,000, black/dark case, GPS only, preferred smallest size. This audit reads the actual URLs returned by discovery; it does not replace the job's saved evidence or establish checkout/delivery to 600019.

Method: the authenticated `read_research_evidence` WebMCP tool exposed normalized provider observations and hash-checked saved snapshots. Ten unique merchant URLs were then fetched directly without cookies or provider credentials at 14:33:40–14:33:47 UTC. All ten returned readable original page text from this local network. Amazon's web-search reader had separately failed; that failure was not treated as evidence of product availability. Dynamic listings can change by region/session and time.

## Actual provider calls

| Tool | Observed result | What this proves |
|---|---|---|
| SerpApi `search_products_india` | Successful response, five Google Shopping leads, zero direct merchant offers | Discovery works; advertised Shopping results are not live offers. |
| Tavily `search_web_tavily` | Two successful calls, six sources each | URL discovery works, but results include unsuitable variants and an unrelated video. |
| Bright Data `fetch_product_listing` | One successful Amazon India extraction, ASIN `B0DGJ6FKSB` | Exact requested and returned ASIN agree; the provider reported unavailable, with no price. |
| Firecrawl, Keepa, MCP transports | No calls in this saved investigation | Live success is not verified by this test. |

The earlier gather phase also had native Google grounding enabled before the external-first gate was deployed. The new final-resort policy is covered by regression tests; this assessment-only retry does not exercise a new discovery phase.

## API/search result versus fresh merchant page

Prices below are the selected product's displayed base prices, not the first currency amount in page text (which often belongs to an advertisement). They exclude separately displayed fees, shipping and accessories. No bank/EMI/exchange price is used as an unconditional price.

| Returned listing | Fresh page check | Outcome |
|---|---|---|
| [Amazon B0DGJ6FKSB](https://www.amazon.in/dp/B0DGJ6FKSB): SE 2 GPS 40 mm Midnight, Midnight Sport Band | Same title/ASIN, currently unavailable, no selected-product price | Bright Data identity and unavailable result corroborated. No current offer. |
| [Amazon B0DGJ7LZH4](https://www.amazon.in/Apple-Smartwatch-Midnight-Aluminum-Detection/dp/B0DGJ7LZH4): SE 2 GPS 40 mm Midnight, Ink Sport Loop | Same title, currently unavailable | Relevant variant lead, no current offer. |
| [Amazon B0DGJ3PCYM](https://www.amazon.in/Apple-Cellular-Smartwatch-Midnight-Detection/dp/B0DGJ3PCYM) | GPS + Cellular 40 mm Midnight, currently unavailable | Contradicts GPS-only requirement. |
| [Amazon B0DGJBPYLP](https://www.amazon.in/Apple-Smartwatch-Starlight-Aluminum-Detection/dp/B0DGJBPYLP) | GPS 40 mm Starlight, Lake Green loop, currently unavailable | Wrong case colour; unrelated carousel prices are not this item's price. |
| [Amazon B0DGHTDRGT](https://www.amazon.in/Apple-Smartwatch-Aluminum-Fitness-Detection/dp/B0DGHTDRGT) | GPS 40 mm Silver, Blue Cloud loop, currently unavailable | Wrong case colour. |
| [Amazon B0DGHT4ZCV](https://www.amazon.in/Apple-Smartwatch-Aluminum-Fitness-Detection/dp/B0DGHT4ZCV) | GPS 40 mm Silver, Denim band, currently unavailable | Wrong case colour. |
| [Flipkart SE 3](https://www.flipkart.com/apple-watch-se-3-2025-gps-40mm-midnight-aluminium-case-sport-band-s-m/p/itm59046ed0837a1) | Selected GPS 40 mm Midnight, base INR 23,499, separately displayed INR 149 fee; seller TREASURE HAUL ONLINE; location not set | Relevant provisional listing. INR 21,374 is conditional and cannot be used for this brief. Complete cost and postcode stock are unverified. |
| [Flipkart SE/SE 2 lead](https://www.flipkart.com/apple-watch-se-gps-40mm-midnight-aluminium-case-sport-band-s-m/p/itm18bab0cde627a) | Selected title omits generation, GPS 40 mm Midnight, base INR 28,999 plus displayed INR 149 fee; out-of-stock labels; seller TrueComRetail | Generation is not established by the page title. Do not accept the search title's SE 2 assertion without further exact-SKU evidence. No confirmed stock. |
| [Flipkart Series 10 lead](https://www.flipkart.com/apple-watch-series-10-gps-cellular-42mm-jet-black-aluminium-ink-sport-loop/p/itmd4e4478a97b36) | Search said 42 mm; page title and selected size say GPS **46 mm**, Jet Black, Ink loop, base INR 31,999 plus INR 199 displayed fee; seller SuperComNet | Confirmed search-to-selected-variant mismatch. URL slug says cellular/42 mm and is not authoritative. Cannot support a 42 mm recommendation. |
| [Flipkart Series 11](https://www.flipkart.com/apple-watch-series-11-gps-42mm-jet-black-aluminium-case-sport-band-s-m/p/itmde93b62877932) | Selected GPS 42 mm Jet Black, Black Sport Band, base INR 42,999 plus INR 249 displayed fee; seller TREASURE HAUL ONLINE; location not set | Above INR 40,000 even before fees. Conditional INR 40,374 also exceeds budget. |

The long and short Amazon URLs for `B0DGJ6FKSB` represent the same ASIN, not two independent products. Five Google Shopping URLs remain discovery pages, not direct merchant listings; one explicitly describes a cellular, starlight, strapless used-grade item and is unsuitable. The YouTube size-comparison lead is not a merchant offer, and the Viltrox camera-lens video is unrelated to this case.

## Remaining gaps

- No official Apple page or independent professional/owner review was retained in this gather checkpoint. A satisfactory research comparison still needs those sources.
- No complete unconditional checkout, new-condition proof, 600019 delivery confirmation or merchant stock verification is established.
- The API results are **not all suitable or exact**. A successful transport must never automatically turn every returned result into a shortlist item or a deal email.
- These independent audit observations are recorded here; they are not silently injected into an already-running model assessment.

## User-supplied Amazon listing — additional audit

The user subsequently supplied `https://amzn.in/d/0e6b5Wzl`. A normal browser navigation resolved it to [Amazon ASIN B0FQG8R2XW](https://www.amazon.in/dp/B0FQG8R2XW): **Apple Watch Series 11 GPS 42mm Jet Black Aluminium Case with Black Sport Band, M/L**, model `MEQU4HN/A`. The selected browser buy box displayed INR 34,499 without exchange, inclusive of taxes, in stock, sold by Clicktech Retail Private Ltd, shipped by Amazon, with free delivery shown for Chennai 600019. Bank offers were separate and were not subtracted. This ASIN is absent from the saved job's discovered merchant URLs; the earlier Bright Data request used SE 2 ASIN `B0DGJ6FKSB`. These are different products, not conflicting responses for the same SKU.

Fresh independent probes used the exact canonical Series 11 URL; no Gemini generation, job-counter reset, checkout or alert opt-in occurred.

| Path | Actual result | Interpretation |
|---|---|---|
| Original Amazon page reader, 16:05:56 UTC | Same Series 11 title and selected buy-box INR 34,499; in stock | Corroborates the browser's selected item and base price. |
| Bright Data, 16:06:02 UTC | Requested/input/returned ASIN all `B0FQG8R2XW`; correct title, seller, model, INR and in-stock flag; current price absent | Extraction identity is correct. Raw response contains `initial_price: 46900` and rounded `discount: -26%`, but neither `final_price` nor `price`; selected variation price is null. Mirana correctly keeps the current price unknown rather than substituting MRP or calculating from a rounded discount. |
| Bright Data delivery context | `input.zipcode` is empty; provider delivery date differs from the 600019 browser session | The transport currently passes only URL. Scraper stock/delivery is not proof for the user's postcode. |
| Tavily extraction, 16:07:19 UTC | Successful literal extraction with matching title/URL; the INR 34,499 price was not corroborated in its returned text | Discovery/extraction success alone does not verify all offer fields. |
| Firecrawl before fix | HTTP 200, exact matching ASIN/title, literal INR 34,499/in-stock markdown, but Mirana returned `INVALID_OUTPUT` | Mirana rejected metadata URL `.../dp/B0FQG8R2XW?th=1` versus requested URL without that presentation flag. This was an integration bug. |
| Firecrawl after local fix, 16:11:38 UTC | Successful literal extraction, matching ASIN/title, INR 34,499 and in stock | Provenance remains provider extraction. The fix ignores only Amazon's known `th=1`/`psc=1` rendering flags for matching exact `/dp/ASIN` paths; different ASINs, unknown variant queries and changed Flipkart identifiers remain rejected. |

The saved plan's concrete questions focused on SE 2, Series 10 and Series 9 despite the broad Apple Watch family request. Combined with absent official catalog coverage and only one expensive Series 11 Flipkart lead, discovery missed a qualifying Amazon listing. Updated generic discovery instructions require current official-catalog generation checks, treating plan questions as hypotheses, prioritizing a supplied exact reference URL, and checking multiple merchants before a product-wide price exclusion. Prompt changes are not proof of a completed new agent run; the old assessment remains incomplete.
