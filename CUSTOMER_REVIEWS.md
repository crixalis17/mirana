# Customer reviews and ranking

Controlled retrieval now resolves review-page URLs from the exact Amazon India ASIN or Flipkart listing identity already discovered. It uses the configured Firecrawl page extraction and Tavily fallback. There is no new credential requirement and no arbitrary server URL fetching. Gemini does not choose the provider. Provider operations still reserve durable counters and preserve cancellation/lease enforcement.

When initial listing work leaves no capacity, follow-up retrieves customer-review pages before spending the remaining allowance on another broad search. Accessible bodies retain timestamps, hashes and provider provenance and are classified as owner anecdotes. Readable review pages survive bounded source merging and are included in the Gemini assessment request. No rating, verification badge, reviewer location, review count or variant is invented. First-page review retrieval is a bounded sample; it does not claim exhaustive coverage or pagination. Reviews may pool variants, and extraction can be blocked.

Hard requirements are evaluated first. Among eligible candidates, Gemini receives ranking priorities of 60% relevant ownership/reliability/service evidence, 25% use-case fit, and 15% complete-cost value. These are prompt priorities, not an independently calibrated numeric score. Missing reviews reduce confidence, not product quality. Recurring failures, durability, installation, after-sales support and use-case relevance take precedence over average stars. Dates, sample size, variant ambiguity and selection bias must be acknowledged. Customer anecdotes cannot establish a technical specification, measurement, price, stock or checkout qualification.

## Verification on 10 October 2026

- Regression fixtures verify safe exact review URL association, first-party review classification, quote-backed anecdotes, price isolation, bounded retention and follow-up priority.
- A captured Gemini assessment request verifies literal customer text and ranking policy reach the actual provider transport (fixture response; no paid model generation).
- Live Firecrawl retrieved the LG T80AJSF1Z Flipkart review page: one rating/review, 3 stars, a Verified Purchase badge and an October 2023 customer statement that the product lacked the advertised inbuilt heater. This is a single dated anecdote, not a confirmed technical finding.
- Live Amazon India review extraction for Whirlpool ASIN B0DGLPJ1MB failed through both Firecrawl and Tavily. This remains an explicit gap; dedicated Bright Data review scraping is not configured and is not claimed live.

These changes are local. Production reports are not silently rerun or rewritten.
