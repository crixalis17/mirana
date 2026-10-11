# Owner research test allowance

The owner API usage dashboard includes **Refresh test limit**. When the rolling research allowance is exhausted, it grants the verified configured Google owner one pending extra research job. It does not start a job. Return to the shopping list and start a new queued item.

The permit lasts 24 hours, cannot accumulate from repeated clicks, and is consumed in the same database transaction that inserts a new research job. Resuming an existing job does not consume it. Failed inserts roll back consumption. Another user cannot use the owner's permit. A changed owner email invalidates old permits. Each deliberate grant after a permit is consumed permits another test; provider usage remains billable.

Public per-user/global settings, stored job history and provider credit balances stay unchanged. Per-job model/tool/token budgets still apply. This replaces Vercel limit edits and redeployments for owner testing.

Server access uses the existing `canViewUsage` policy: verified Google identity, configured exact owner email, real account, no preview identity. The route rejects cross-site requests, unauthorized accounts and nonempty POST input. WebMCP exposes `mirana_admin_research_allowance` and `mirana_admin_refresh_test_limit` on the owner dashboard with the same server checks.

Schema addition: `research_test_permits` and its pending-per-owner unique index. Included in `db/schema.sql` and the additive research schema initializer; existing purchases/auth/provider data are preserved. No production migration or permit creation occurs merely from local tests/builds.

Verification: `tests/research-test-allowance.test.mjs` uses an isolated local database and forbids network calls. It tests authenticated route access, CSRF rejection, payload validation, concurrent grant deduplication, concurrent one-job consumption, expiry, owner changes, rollback, preserved quotas/history and WebMCP validation.
