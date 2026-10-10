# Mirana WebMCP

Mirana registers browser tools through `document.modelContext` when the browser supports WebMCP. Ordinary browsing continues to work without that API. No extension, remote MCP server or provider secret is bundled with the app.

The tools cover shopping requests, preferences and custom tags, recommendations, price history, research initiation, item status and deal-alert settings. Navigation and UI-state tools let an agent inspect the workspace and open onboarding without relying on screenshots. Google authentication still completes through the Google sign-in page.

Every data tool uses the same authenticated, same-origin API routes as the interface. Item ownership, origin validation, provider readiness and alert cadence checks remain enforced by the server. Inputs are validated before requests, unknown fields are rejected, and no tool accepts an arbitrary endpoint or exposes credentials. User text, tags and research results remain untrusted content. Registration is cancelled on account changes and component unmount.

Use the browser's WebMCP discovery interface to list tools and their JSON schemas. Reads are marked read-only; tools that start paid provider work or change email subscriptions carry consequential hints. A connected agent must obtain the appropriate user authorization before using them. Research and email features require configured providers; tools report setup errors when a connection is missing.

## Tool coverage

| Area | Tools |
| --- | --- |
| Workspace and setup | `read_workspace`, `read_configuration`, `read_session`, `get_google_sign_in_link` |
| Preferences | `read_preferences`, `save_preferences` |
| Shopping list | `read_shopping_list`, `read_shopping_item`, `add_shopping_item`, `edit_shopping_item`, `set_shopping_item_status` |
| Research and prices | `read_research`, `read_research_job`, `read_price_history`, `start_research`, `cancel_research`, `retry_research` |
| Alerts | `set_deal_alerts` |
| Interface and onboarding | `get_ui_state`, `show_view`, `open_item_form`, `open_alert_settings`, `close_dialog` |
| Session | `logout` |

Application failures return `ok: false`, an error message and an error kind so browser agents can read the actual cause. Invalid inputs never trigger an API request. A refresh warning after a successful mutation means read the saved state before retrying; blindly repeating an add can duplicate an item.

The item detail view reads persisted research progress, polls active jobs, stops on terminal states and refreshes the report once a completed job appears. The selected item is retained in the page URL across refreshes. Progress exposes human-readable stages, a read-only plan, recent public events and actual evidence gaps, without invented percentages. Switching items aborts stale requests.

`read_research_job` validates the item against the signed-in workspace and reads `GET /api/research?purchaseId=…`. Cancellation and retry use the same authenticated `PATCH /api/research` endpoint as the UI. Retry can incur further usage charges; cancellation cannot undo provider requests already sent. A strict nested whitelist strips raw model outputs, private reasoning, usage payloads and credentials from every job result. The public job contains only status, stages, plan criteria/questions, events, completed steps, bounded call limits, timestamps and evidence coverage.

## Local verification

Develop against an isolated local SQLite database. Exercise preferences → saved request → research input, and create → edit → pause → resume → purchased → reopen → alerts. Verify invalid inputs, ownership isolation, setup-required responses and browser registration cleanup. `npm test` runs automated regression tests; `npm run build` verifies the production build. Screenshots remain useful for layout, readability and responsive behavior.

Changes must remain local until the user requests a release. Do not use production customer data for fixtures or enable authentication preview mode in production.

API and security references: [WebMCP draft](https://webmachinelearning.github.io/webmcp/), [Chrome tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools).

## Private owner usage tools

The protected `/admin/usage` page registers `mirana_admin_usage` (GET cached account usage) and `mirana_admin_usage_refresh` (POST refresh, throttled to 30 seconds per server instance). Both accept only `{}` and use `/api/admin/usage` with the signed-in session. They are absent from ordinary shopping pages and the Gemini research agent. Server authorization requires the exact verified owner Google identity on every call, regardless of which browser invokes it. Unauthorized access clears the dashboard and unregisters its tools. See [ADMIN_USAGE.md](ADMIN_USAGE.md).
