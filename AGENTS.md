# Mirana on Vercel

This is the user-selected migration target: native Next.js, Turso/libSQL and independently authenticated research workers. Follow SETUP.md and MIGRATION.md. Preserve the separate owner-private legacy Site and data until verified cutover. Do not claim a Vercel alias is deployed or available without verification.

Read the relevant guide in node_modules/next/dist/docs/ before changing Next.js APIs or configuration. The development/build scripts use webpack because the current local Turbopack subprocess cannot bind its required socket. Provider credentials and actual merchant checkout service are still unconfigured; AI research remains provisional without checkout receipts. Never bypass production Google authentication, expose machine secrets, or auto-adopt private data for a new Google user.

Develop and verify changes on localhost first, using isolated local test data. Do not push or deploy changes to production until the user explicitly requests a release. Expose user-facing features through authenticated, validated WebMCP tools where supported; use browser screenshots for visual verification.

Keep a live debugging checklist in the chat. Mark an item complete only after verification, update it as work progresses, and carry unresolved items into the final response. The user requested this for all future debugging work.
