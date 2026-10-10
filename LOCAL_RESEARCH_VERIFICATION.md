# Local staged research verification

Updated on 8 October 2026. The enhanced original-source/claim-ledger iteration has completed local contract verification and two isolated enhanced live studies; recommendation quality is not release-ready. These changes have not been pushed or deployed; production configuration and the separate private legacy Site remain unchanged.

## Enhanced implemented flow

An authenticated shopping request creates an owner-scoped durable job. The engine runs `plan → gather → read → assess`, optional bounded `followup → read → assess` rounds, then `synthesize → verify → publish`. Planning separates hard requirements and soft preferences. Discovery finds leads; the new independent reader retrieves original approved pages; assessment creates typed claims with quote/text/hash/date references. A saved reading checkpoint can resume without repeating discovery.

Source reading accepts at most 12 pages per round with concurrency three, an eight-second source deadline and one-MiB consumed-body cap (HTML prefixes remain usable with explicit truncation; oversized JSON is rejected). Exact approved official/retailer/review/owner hosts are allowed; arbitrary URLs and private addresses are rejected. Redirects, CAPTCHA/login gates, unsupported PDF/MIME formats, timeouts and other failures are recorded without invented text. HTML/JSON text remains untrusted and bounded to 12000 characters/source and 36000/round; quote references point into the exact hashed stored body and truncation is explicit.

Typed assessments distinguish supported/contradicted/unknown hard requirements, measured results, specifications, opinions and owner anecdotes. Exact-variant, condition, availability, required-accessory compatibility and cost checks preserve missing evidence and block applicable contradictions. Quote association proves that text exists in an independently read snapshot; it does not prove truth or correct model interpretation. Original bodies and proof quotes remain server-side; published reports expose compact statuses and source references.

Brief revisions and expiring leases prevent cancelled, edited or concurrently dispatched work from publishing stale results. The UI and WebMCP reconnect to saved progress and expose cancellation and bounded retries. `RESEARCH_LOG_LEVEL=info` adds known stage/event, hashed job, timing, bounded counts and usage diagnostics, including the non-model `read` stage. Logs omit identities, shopping text, URLs, prompts, source/provider bodies, headers, secrets and hidden reasoning.

Ordinary Vertex Gemini calls are an explicit provider option. The application default remains OpenAI; saving Google credentials does not switch it. Due opted-in watches refresh saved listings without broad model research.

## Enhanced verification status

| Check | Current status |
| --- | --- |
| Source-reader fixtures | Targeted test passes for HTML/script/hidden/login-field removal and useful static product-form/noscript retention, entities, metadata, original-text hash/quote integrity, size limits, streaming cancellation, private/disallowed hosts, redirects, human-verification, concurrency and interrupted streams. All fetches were mocked. |
| Claims, schema enums/runtime bounds and safe logs | Pass in the integrated suite, including exact quote/SKU guards, functional accessory slots, all-unknown lead exclusion, enum/bounds validation and secret-canary checks. |
| Automated suite | All 14 suites pass after the final claim/accessory/reader corrections. Tests include isolated database persistence, read checkpoint journals, cancellation/concurrency/retries, actual-request budget checks, API ownership/CSRF, original sources, reports, logs and WebMCP. |
| TypeScript and build | Final TypeScript check passes; production build passes. |
| Focused lint | Enhanced transport, iterative engine, claims, reader, logs, jobs, worker, report/progress components, WebMCP, smoke script and related tests pass. |
| Enhanced live workflow | One eight-attempt isolated Vertex study completed the original-source flow, including one follow-up and two explicit checkpoint retries. Manual audit rejected its remaining all-unknown lead; the corrected guard was verified by offline replay without extra provider calls. This is execution evidence, not a dependable buying recommendation. |
| Full repository lint | Earlier run failed on existing typing/React findings outside its passing focused set. No clean full-repository lint result is claimed. |


## Enhanced live study and fixes

The separately isolated `--enhanced --live` study used the same tablet brief and `gemini-3.8-flash`, with a persisted eight-attempt cap. The original four-call study database was not reset. The enhanced job completed `plan → gather → read → assess → followup → read → assess → synthesize → verify → publish`, with one failed follow-up and one assessment deadline requiring explicit retries. Completed stages were reused; eight total attempts were retained. Six successful model calls reported 43132 input tokens and 12299 visible/thinking output tokens. Usage for the two failed attempts was not returned, so this is not an invoice total.

Discovery recorded 46 distinct URLs across two rounds. The historical read checkpoints contained six nominal reads, including one 17-character dynamic shell, and 17 unavailable/disallowed/failed pages. Only five snapshots contained useful original text. Current code rejects insufficient text, retains useful static no-JavaScript product details, reads bounded HTML prefixes rather than rejecting all large pages, and prioritizes approved hosts with diversity. CAPTCHA, redirects and restricted pages are not bypassed.

The first completed report retained Xiaomi Pad 6 as provisional, had no actionable offers, unknown kit cost and no supported hard/comparison claims. Manual audit found this too weak for #1. The new all-unknown guard rejects it; offline replay of the saved ledger retained zero recommendations and kept research leads/gaps visible. This preserves the immutable original live study and does not pretend that the post-audit fixes received another full paid live run. Functional-accessory slot and conditional-adapter corrections were independently regression-tested; the historical plan's placeholder accessories are not retroactively treated as correct.

Logs led to fixes for no-JavaScript/product-form extraction, huge HTML handling, source prioritization, deadline classification, concise assessments, evidence-gap question ordering, generic accessory duplication and all-unknown ranking. One early failure used `UNEXPECTED_ERROR`; provider output/schema/no-evidence failures now have typed safe codes. The assessment retry completed in about 28 seconds and synthesis in about eight seconds. Eight-attempt accounting survived both retries.

A synthetic copy of the audited study is displayed as **Local live research audit** in the separate local preview database. WebMCP progress/report navigation and refresh persistence were verified with no provider calls from the browser, no emails and no production writes. It shows “No supported shortlist yet,” compact expandable gaps and saved progress. The original ignored artifacts remain in `outputs/research-live-smoke-v2-2026-10-08/`; `.env.local` and study artifacts remain outside source control.

## Contract-corrected live study and final audit

A second separately isolated enhanced study used `--contract --live`, `gemini-3.8-flash`, the same tablet requirements and the same persisted eight-attempt / 24000-output-token cap. It completed planning, discovery, original-page reading, assessment, one follow-up, a second reading pass, synthesis, verification and publication. Its second assessment exceeded the provider output limit. An explicit retry preserved the first completed assessment and the newly read but unassessed sources, reserved the final-report budget, and continued to synthesis. Six attempted model calls were retained, including the failed assessment. Five successful calls returned 38972 input tokens and 18050 visible/thinking output tokens; the failed attempt's usage is unknown.

Ten useful original-page snapshots were read across two rounds; the latest-per-URL progress view contains eight readable sources and four unavailable or unreadable sources. Fair text allocation now prevents a few long pages from consuming the complete reading-context cap. Only the first reading round was fully assessed; the report explicitly records that the later evidence remained unassessed. Source counts describe retrieval, not proof of suitability.

The original live report contained two provisional candidates. Offline replay against the exact snapshots available to the completed assessment found warranty text incorrectly labelled as proof of brand-new condition and pressure/palm features. It also found a host-normalization bug rejecting `www.flipkart.com` as an India-market listing and short literal listing prices rejected as quotes. Regression-tested fixes preserve literal first-price association, normalize the Flipkart host, reject warranty-as-feature evidence and reject price-as-card-eligibility evidence. Required accessory inclusion strings are cleared pending verification. A country/condition/budget check alone can no longer establish suitability or a #1 recommendation.

The audited result retains **zero shortlist recommendations**: independently read listing prices exist, but use-case, comparative review, compatibility and complete-kit evidence remain insufficient. It does not pad top three or turn this execution result into a buying recommendation. The immutable live study remains in `outputs/research-live-smoke-v3-2026-10-08/`; `postfix-audit-report.json` and `postfix-audit-summary.json` are separate offline artifacts. The synthetic local audit item shows this latest result; no additional provider calls, emails or production writes were made during replay. WebMCP navigation and the rendered zero-shortlist state were verified after refresh. Recent browser warnings/errors were empty; the inspected dev-server log contained 141 returned request statuses with no HTTP 5xx or compilation errors. Visual proof is saved privately at `outputs/research-live-smoke-v3-2026-10-08/local-audit.jpg`.

The final targeted changes also align shopping-list provisional labels with detailed reports. All 14 suites pass; the TypeScript/build and focused enhanced-file lint checks pass. Full-repository lint still has its earlier unresolved baseline; public release readiness is not claimed.

## Historical earlier-iteration evidence

Before the independent-reader and claim-ledger enhancements, all ten then-current suites, TypeScript, production build and focused lint passed. No deployment was performed. Local browser/WebMCP navigation and refresh persistence were checked; duplicate sibling keys were fixed. Progress read recovery used 3-, 6- and 12-second retries, exposed Check again afterward, stopped on authentication failures, and aborted timers/requests on unmount.

The earlier isolated live Vertex smoke test used `gemini-3.8-flash` and completed `plan → gather → assess → synthesize → verify → publish` with four model calls. Discovery returned 23 cited sources. **This flow did not include the new independent original-page reading or typed quote-backed claim assessment.**

Its request was a new 10–11 inch tablet for notes, PDFs and drawing, INR 60000 including a pressure-sensitive stylus, top three, postcode 600019 and conditional SBI eligibility. The four-call cap skipped follow-ups to reserve synthesis; normal eight-call/two-follow-up behavior was checked using isolated fixtures.

That historical report retained one provisional candidate and four evidence gaps, including missing direct Amazon India/manufacturer coverage. Item price and complete kit total remained null and checkout unverified. It established the earlier workflow's execution, not a dependable buying shortlist, model-quality release gate or enhanced-flow validation.

The test used a synthetic owner, disabled alerts/email/merchant adapters, and wrote ignored private local artifacts. It did not change production data or configuration. API usage may be billable; promotional-credit eligibility and actual invoicing were not verified.

## Remaining release work

- Evaluate enhanced live retrieval and claim quality across categories, including inaccessible retailers, contradictory sources, exact generations/variants and accessory costs. Models remain fallible even with exact quote association.
- Verify semantic hard requirements and dependable recommendation quality. Empty/provisional shortlists are valid when evidence is insufficient; better coverage must not weaken evidence checks.
- Choose and verify a reliable frequent production dispatcher. Next.js `after()` is a wake-up opportunity; daily Hobby cron does not ensure prompt continuation or 12-hour checks. Local sustained execution is explicit: `npm run worker:local` against the same local file database.
- Connect actual merchant checkout evidence, then verify qualifying opted-in email delivery and deduplication. Reading original pages and recording prices do not establish full checkout eligibility.
- Resolve the full lint baseline before treating the repository as a clean public-release candidate.

The bounded smoke script is `node --experimental-transform-types scripts/research-live-smoke.mjs --live`; default invocation is a dry run. It preserves its four-call budget in `outputs/research-live-smoke-2026-10-08/smoke.db`; failed runs require explicit `--retry` and cannot reset the cap. That database may already contain the completed historical workflow: rerunning it can reuse old completed work rather than test newly added stages. The separately isolated enhanced invocation is `node --experimental-transform-types scripts/research-live-smoke.mjs --enhanced --live`; it retains its eight-attempt cap, including failed calls and explicit retries. It may already be completed and cannot serve as a new test merely by rerunning the script.

The latest bounded study command is `node --experimental-transform-types scripts/research-live-smoke.mjs --contract --live`. It preserves its independent eight-attempt budget in the v3 directory; rerunning a completed study is not a fresh live evaluation. Follow-up rounds are maxima, not guarantees: actual returned output usage reserves room for synthesis, and evidence left unassessed is labelled.
