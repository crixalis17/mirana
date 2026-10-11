# MacBook Air versus Neo: production test

Run date: 11 October 2026. Saved purchase: `3e9c1a4c-961b-4832-b32b-cea649cca4bc`. Research ran from 12:36:23 UTC to publication at 12:47:44 UTC. This was one production job, not repeated fresh research. Daily settings were restored to 3 per user and 10 globally; restored deployment `dpl_6HGZPuUKc7wj784enVSCWjmqdAEH` was READY before publication.

Requirements: new Apple MacBook Air versus MacBook Neo, at least 8GB RAM and 256GB storage, any colour, INR 120,000 total maximum. Main uses: writing, Google Docs, Claude Desktop, browsing and video playback. Video editing optional. Bengaluru delivery with no supplied postcode; no bank eligibility assumed. Alerts off, no inherited buying tags.

## Result

Execution completed, but the comparison acceptance test failed: `products: []`, `recommendedId: null`. Verification withheld unsupported recommendations. The result does not establish that no suitable laptops exist or that Neo is unavailable.

This tested the deployed **controlled retrieval** path. The Gemini-directed retrieval-only experiment added in commit `f18b891` is a local harness and was not activated in production. Model: Gemini 3.8 Flash. Runtime logs recorded four model generations, 24 external tool operations and zero built-in Google search queries. Reported generation totals: 51,076 input tokens, 12,483 output tokens and 78,573 thinking tokens. These are reported usage metadata, not an invoice. Model output ceiling was 65,536 per generation.

## Provider and evidence audit

| Observation | Interpretation |
| --- | --- |
| Firecrawl and Tavily search succeeded; Bright Data returned four identifiable Air listing records | The integrations executed; this was not a complete provider outage |
| Amazon `B08N5W4NNB`: M1, 8GB/256GB; no price, explicitly unavailable | An identified research lead, not a purchasable offer |
| Amazon `B0DZDDK22Z`: 15-inch M4, 16GB/256GB; no price, explicitly unavailable | Another unavailable listing; cannot meet the budget on an unknown price |
| Flipkart `itm6b02c9a9d9d28`: M1 8GB/256GB, reported INR 84,899; stock/seller/condition unknown in normalized API record | Price alone cannot establish an eligible offer; final assessment reported out-of-stock evidence |
| Flipkart `itmc2732c112aeb1`: URL slug says M2 8GB/512GB, returned title says MLXW3HN/A 8GB/256GB, reported INR 82,499 | Must use selected variant evidence, not URL slug; identity conflict needs resolution |
| Apple's Neo announcement was discovered and independently read | Neo existence was established; announcement launch pricing is not current checkout pricing |
| Neo merchant URL `B0GR64G4H6` was observed among page links, but no normalized Neo listing API extraction was saved | The pipeline had a Neo lead but did not close its exact variant and offer evidence |
| Unrelated Asus/MSI/Dell links entered the source set from related-product sections | Source collection lacked sufficient identity filtering; these were not recommendations |
| Generic reviews and blocked owner pages consumed evidence work | Successful search/read counts do not imply relevant review coverage |

No postcode eligibility, complete checkout total or new-condition verification was established. No purchase or email delivery occurred.

## Diagnosed weaknesses

1. `retrievalQueries` combines the captured model field (`MacBook Air or MacBook Neo`) into one identity and fixed coverage queries. It does not allocate separate discovery/extraction coverage to each family. Production logs expose operation names rather than exact query payloads, so this query construction diagnosis comes from the deployed source and captured brief, not a raw request trace.
2. The first merchant leads receive the limited extraction slots. Newer Air and Neo leads were discovered, but four extraction records concentrated on older/unavailable Air listings.
3. The remaining four follow-up operations prioritized customer-review retrieval; exact Neo offer and specification gaps remained. Once 24 operations were spent, the app correctly preserved gaps instead of fabricating a purchase result.
4. The report describes INR 137,900 as the official Air starting price, while the saved page is Apple's **education store**. It must distinguish conditional education pricing from normal-store pricing. Current operator-side Apple India store inspection showed a different normal starting price; that inspection was not injected into the job.
5. The model's synthesized candidate associations could not satisfy verification. Neo was rejected for insufficient exact model/variant association despite the separately verified official announcement. This is a linkage/coverage failure, not proof that Neo does not exist.

Follow-up work: deploy a separately validated family-aware retrieval flow, require exact product-page coverage for both families, filter related-product contamination, distinguish education/bank/exchange pricing, and obtain attributable review bodies before review-first ranking. Do not claim the newer local agentic experiment failed based on this controlled-path test.
