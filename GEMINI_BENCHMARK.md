# Local Gemini evaluation

This is a standalone benchmark, not a switch of Mirana's production research provider. It uses Vertex AI with the explicit Google Cloud project from `.env.local`. It does not update shopping items, write to Turso, dispatch cron or send email.

Set `GOOGLE_API_KEY` and `GOOGLE_CLOUD_PROJECT` in the ignored `.env.local`. The key must be authorized for Vertex AI in that project. An AI Studio key or a working token-count endpoint alone does not establish eligibility for Cloud promotional credits. Verify the credit's scope in Cloud Billing and check the usage against the correct billing account.

## Commands

Run from the `mirana` directory using the repository's supported Node version:

```sh
# Describe the plan without contacting Google or loading the credential.
node --experimental-strip-types scripts/benchmark-gemini.mjs

# Token counting only: checks API access, not research or credit coverage.
node --experimental-strip-types scripts/benchmark-gemini.mjs --preflight

# Initial tablet comparison: at most six generation requests.
node --experimental-strip-types scripts/benchmark-gemini.mjs --live --case tablet

# Complete the remaining cases and repeat the tablet brief.
node --experimental-strip-types scripts/benchmark-gemini.mjs --live

# Regenerate the local summary without contacting Google.
node --experimental-strip-types scripts/benchmark-gemini.mjs --report
```

Live generation is billable. The saved study allows at most **24 generation attempts**, including interrupted requests, and 6000 output tokens per request. There are no automatic retries. Saved case/model attempts are skipped on subsequent invocations. Clearing the saved study starts a fresh billable study; do not clear it just to regenerate a summary. Request/token limits bound the test size, not a guaranteed monetary ceiling. Google search query counts are chosen by the model, and provider costs/billing reports can be delayed.

## Study and artifacts

Models documented and token-count access checked on 8 October 2026:

- `gemini-3.8-flash`
- `gemini-3.5-flash-lite`
- `gemini-3.1-pro-preview`

The study contains the user's tablet brief, synthetic laptop and air-purifier briefs, and a repeated tablet run. The model order rotates between cases. Each model uses the same exported Mirana research instructions and report schema, medium research thinking, low extraction thinking and the same output ceiling. All models must return completed search-grounded research before extraction is attempted.

`outputs/gemini-benchmark-2026-10-08/results.json` stores research text, grounding sources/supports, structured output, normalized provisional reports, usage, errors and timings. `report.md` summarizes mechanical checks. The folder is ignored by Git. Secrets and authentication headers are never saved or printed.

Prices are conservative estimates at global list token rates, including returned thinking tokens, before introductory promotional credits. Search estimates assume the account's free search allowance is exhausted. These estimates are not invoices; requests interrupted without returned usage can have unrecorded costs. This study cannot inspect credit eligibility or automatically verify deductions from the Cloud credit balance.

The independent review must inspect requirement satisfaction, exact variants/accessories, source support, tradeoffs and review attribution. Source membership alone does not verify a claim; price snippets do not establish checkout cost, stock, seller, card eligibility or postcode delivery. The benchmark does not award an automatic quality score or declare a best model from structural checks. No qualifying deal or live email is implied by successful research.

## Official references

- [Vertex AI authentication](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/gcp-auth)
- [Gemini 3.8 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash)
- [Gemini 3.5 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite)
- [Gemini 3.1 Pro](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-pro)
- [Google Search grounding](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-search)
- [Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output)
- [Pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [Cloud credit restrictions](https://docs.cloud.google.com/free/docs/free-cloud-features)

## HIGH-thinking Flash 3.8 comparison

The user requested a separate HIGH-thinking rerun, restricted to `gemini-3.8-flash`, on the identical four-case test set. They then explicitly requested a very high output allowance and removal of the 90-second deadline. The revised test uses HIGH for both search research and structured extraction, **65536 maximum output tokens** (the model's documented maximum) and **no application-imposed generation deadline**. Provider/network limits can still apply. The full generated research text is supplied to extraction rather than applying the historical 50000-character cut. The same prompts, schema and case definitions are used by the current benchmark code. No original-page reader or claim ledger is added to this historical two-stage benchmark.

```sh
# Inspect the revised configuration without loading credentials or calling Google.
node --experimental-strip-types scripts/benchmark-gemini.mjs --thinking high

# At most eight generation attempts, covering research/extraction for four cases.
node --experimental-strip-types scripts/benchmark-gemini.mjs --thinking high --live

# Recreate mechanical comparison of saved studies, without provider calls.
node scripts/compare-gemini-thinking.mjs
```

The new study is saved independently in `outputs/gemini-benchmark-high-max-2026-10-08/`. A started tablet request under the initially proposed 6000-token/90-second HIGH settings was interrupted when the user changed those settings; its separate `outputs/gemini-benchmark-high-2026-10-08/` artifact is preserved as superseded, with unknown usage. It does not count as a completed comparative result and can still have been billable.

The historical 3.8 Flash results completed tablet and air-purifier cases and timed out on laptop and repeated tablet: 2/4 completed. Returned-usage estimates total $0.403144 for the completed requests; the two timed-out requests have unknown usage. The baseline results file is hash-checked and never overwritten by the comparison. Higher headroom, a removed deadline and live search differences confound a pure thinking-level comparison. Historical prompt text was not snapshotted, so byte-identical prompts cannot be proven from the saved study. Neither source membership nor retained candidate counts represent accuracy. The qualitative audit must check requirements, variants, compatibility, costs and review attribution alongside completion/latency/usage.

Reference: [Gemini 3.8 Flash maximum output and supported thinking levels](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash).

The original HIGH laptop request failed with `fetch failed` after 301 seconds, consistent with Node fetch's implicit header deadline. No usage or answer was returned, so this is a transport failure, not a reasoning-quality result. HIGH generation now uses native HTTPS without an application socket/header deadline. Network/provider limits still apply. An explicit retry preserves the original failed study and writes a separate two-request artifact:

```sh
node --experimental-strip-types scripts/benchmark-gemini.mjs --thinking high --retry-transport --case laptop --live
```

This command requires a matching saved transport failure and will skip a saved retry attempt. It never silently repeats a potentially billed request. `compare-gemini-thinking.mjs` reports the original study and any separate transport retry, including failed attempts' unknown usage. The legacy baseline transport/configuration and artifacts remain unchanged.
