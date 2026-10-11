# Fresh Gemini-directed production test — 11 October 2026

Result: completed, but failed the product-comparison acceptance test. No shortlist or winner was published. This is not evidence that no qualifying laptop exists.

## Run identity and clean-start verification

Production: https://mirana.vercel.app/?purchaseId=3e9c1a4c-961b-4832-b32b-cea649cca4bc

Deployment: dpl_5Q24LNiGwH1crikPxLKN4K7hzA6r; commit d84bd21aa0645ffa37fc73a3978bc47a9e139f5f.

New job: 5f719cd1f78b1f8dd40ef2e28d0d2453f940b90cac601c6a7e09f22543c3fd1e.

Log hash: 6d5b0808d16f8657256de452a01fdba447a804ebdd791f492b865bab11843bcc.

Created 11 October 2026, 7:02:11 PM IST; publication logged at 7:10:00 PM IST. Roughly 7 minutes 48 seconds.

Before start, authenticated WebMCP confirmed job=null, report=null, parsed=null and the item queued. The new job began at plan with zero attempted model/tool calls. It did not reuse the earlier job's plan or source snapshots. Historical provider caches are outside Mirana's control; a new run does not guarantee uncached third-party pages.

The owner had explicitly refreshed one test permit and authorized this fresh run. Only one job was started. Public rolling limits remained 3 per user and 10 globally.

## Brief

Apple MacBook Air versus MacBook Neo. New only, 13-inch laptop class excluding 15-inch and larger; minimum 8GB RAM and 256GB SSD; any colour; total ceiling INR 120,000. Uses: content writing, Google Docs, Claude Desktop, browsing and video streaming. Video editing optional. Bengaluru delivery, exact postcode unspecified. No card eligibility assumed. Top 3 maximum; alerts off; no inherited priorities or tags.

## What was verified

Production stage logs explicitly report retrievalMode=gemini-directed. Model is Gemini 3.8 Flash. Individual generations allow 65,536 output tokens. Worker model budget remained 8 calls; external tool budget remained 24.

All stages completed: plan, gather, read, assess, followup, read, assess, synthesize, verify, publish. Final counters: 8 model calls and 4 external tool calls. No API listing observations were saved. Nine unique discovery sources were reported at completion; these are not nine verified product listings.

Executed external operations:

1. Tavily search: successful, six sources.
2. Direct original-page read: failed, no source returned.
3. Tavily extraction: successful, one official page extraction.
4. Follow-up Tavily search: successful, six sources.

No Firecrawl, SerpApi or Bright Data calls appear in the persisted tool traces. Their absence cannot be interpreted as provider failure. Built-in Google Search was not used.

Initial discovery covered official Neo announcement, product and shop pages, including an education-store link. The reader captured ordinary/education shop FAQ text but no current exact checkout price. Some original reads were blocked. The initial sources were Neo-focused; Air comparison coverage and direct Amazon/Flipkart product/review evidence remained absent in the final gaps. Launch price prose is not today's verified checkout price; education eligibility was not assumed.

## Root cause established by logs and code

The production adapter introduced a substantially tighter per-invocation model-turn boundary than the earlier local retrieval harness:

- lib/research/directed-retrieval.ts:15 hardcodes maxSteps:4.
- lib/research/tool-agent.ts:298 stops retrieval-only after function responses when modelCalls >= steps-1. Thus this pass stopped after three model turns, even though external operations remained.
- The local washing harness permits 16 calls by default, and the watch fixture sets maxSteps:24. These are not equivalent runtime settings.
- lib/research-jobs.ts:25 bounds the complete production job to 8 model calls.
- lib/worker.ts:67 reserves two calls during gather/followup for later stages. After plan (1), gather (3), and assessment (1), follow-up had room for only one model call before its next generation hit the reservation boundary.

That combination explains three initial external operations plus one follow-up search, while 20 external operations were still unused. The request-per-day permit only authorizes another job; it does not refresh or enlarge the per-job model/tool limits.

The agent chose a valid official Neo discovery search, then attempted reading and fallback extraction. This demonstrates the model-to-tool path is active, but not that it can complete the comparison under these limits. This run is primarily a retrieval orchestration/configuration failure, with a real direct-page access failure as a secondary limitation. It does not isolate model quality or prove extraction providers are broken.

The limits were left unchanged during the test so its outcome remained auditable. No new deployment, second job or automatic credit-consuming rerun was performed.

## Published result and remaining work

products=[]; recommendedId=null; status='Research complete · checkout unverified'. No recommendation was fabricated. The report preserves missing Air coverage, current unconditional prices, Neo RAM, customer reviews, independent reviews, new-condition/stock and postcode delivery evidence.

The active mode succeeded as deployment wiring; the comparison failed as product behavior. Before rerunning, align the production retrieval-turn policy with the validated harness, allocate model calls to discovery/extraction before assessment, preserve adaptive sessions/checkpoints across worker segments, and require retrieval coverage of both requested families and retailer evidence before entering ranking. Do not silently interpret unused external operations as successful retrieval or label an empty comparison as a successful buying recommendation.

An exact Bengaluru postcode is still needed to verify delivery; its absence does not justify omitting general product discovery.
