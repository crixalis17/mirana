# Gemini 3.8 Flash HIGH benchmark

Local evaluation on 8 October 2026. Only Gemini 3.8 Flash is called. No production provider changes, shopping-list writes, database updates, cron dispatch or emails.

## Method

The same four historical benchmark cases are used: tablet, laptop, air purifier and repeated tablet. The old configuration is MEDIUM search research / LOW structured extraction, 6000 output tokens per request and a 90-second application deadline. The user explicitly requested HIGH for both stages, the model's documented maximum output allowance of 65536 tokens, and no application generation deadline. Provider and network limits still apply. The full returned research text is supplied to HIGH extraction. Up to eight generation attempts cover the four cases; there are no automatic retries.

Both configurations enable Google Search during research. HIGH tablet research returned 23 distinct search queries and 34 raw grounding sources. These are provider-generated answer/source associations; this historical two-stage benchmark does not independently read the original pages. Mirana's newer durable research workflow has an original-page reader and a claim ledger and is evaluated separately.

Historical baseline artifacts remain immutable and hash-checked. Current prompt/schema hashes are recorded; historical prompts were not snapshotted, so byte-identical prompts cannot be independently proven. Different live search results, higher output allowance and removal of the deadline confound a pure thinking-level comparison. No accuracy score or overall model winner is assigned from completion or candidate counts.

The first HIGH tablet request started with the initially proposed old limits and was interrupted after the user changed the configuration. It is preserved separately as superseded; usage was not returned and can still be billable.

## Interim findings

The first HIGH tablet case completed research in 196 seconds and extraction in 114 seconds. It used 19328 returned thinking tokens across the two stages. Three provisional candidates were structurally retained, as in the baseline tablet case. This establishes execution and additional reasoning, not factual accuracy or a verified purchase recommendation.

Independent audit found better accessory planning: the compatible Pencil and adapter are explicit, Samsung's separate charger is budgeted, variants are more specific and the #1 rationale considers detailed artwork/apps. However, attribution remains weak. Some Samsung price/pen claims point to unrelated Xiaomi sources; one Samsung offer uses a Levant regional page while labelled India, and a Xiaomi price tracker is labelled Flipkart. Unsupported precise layer/performance claims survive. Separate stylus prices can appear as offers for the whole tablet kit. Complete costs, seller, bank eligibility and postcode delivery remain unverified.

The user stopped this study. No further benchmark requests will run. Saved completed cases and interrupted requests are retained; missing usage remains unknown. The current work is local integration of live product tools, not a continuation of this benchmark.

## Artifacts

- Ignored raw HIGH study: `outputs/gemini-benchmark-high-max-2026-10-08/results.json`.
- Offline mechanical comparison: the same directory's `comparison.json` and `comparison.md`, regenerated using `node scripts/compare-gemini-thinking.mjs`.
- Historical baseline: `outputs/gemini-benchmark-2026-10-08/results.json` (preserved).
- Superseded initial HIGH attempt: `outputs/gemini-benchmark-high-2026-10-08/results.json` (unknown usage).

Token/search estimates use the same conservative standard list-rate assumptions for both studies before promotional credits. They are not invoices or confirmed credit deductions. Missing usage is unknown, not zero cost.

[Google's documented thinking levels and maximum output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash). See [GEMINI_BENCHMARK.md](GEMINI_BENCHMARK.md) for commands and isolation details.
