# Moving Mirana from Sites to Vercel

This repository is the target: ordinary Next.js on Vercel with a hosted libSQL/Turso database and independent machine authentication. If migrating an existing private deployment, preserve its database, credentials, source and linked schedule during preparation. The legacy deployment and private exports are intentionally excluded from this public repository.

No hosted migration or Vercel production address is supplied by this repository. Existing workspace exports must be obtained through owner-authorized access, kept private and imported under an explicit verified Google subject. Choose an available Vercel production alias; `mirana.vercel.app` is not reserved or guaranteed available.

## What changes

| Existing preview | Prepared target |
| --- | --- |
| Sites owner-private audience | Google identity required for production workspace access |
| Cloudflare D1 binding | Hosted libSQL/Turso over its authenticated protocol |
| Sites service token for shared private research | Independent `AUTOMATION_SECRET` for machine operations |
| Linked Sites/Codex cloud researcher | Configured OpenAI Responses web-search worker |
| Sites hourly schedule | Vercel daily cron or external/Pro hourly scheduler |
| Email-username Sites namespace | Chosen stable Vercel app alias |

Google session cookies and OAuth flow state do not move between hosts. Sign in again on the new origin. Change the Google callback and `APP_ORIGIN` together only after the actual stable Vercel alias is known.

## Schema and owner-bound data transfer

1. Complete the Vercel/Turso/Google setup in [SETUP.md](SETUP.md). Apply `npm run db:migrate` against the intended new database. This creates schema only.
2. Sign in to the new app with the intended owner Google account. Data import requires an existing verified account and its Google subject ID. The signed-in `/api/auth/status` response includes this ID as `user.id`. Never assign private preview records to the first arbitrary visitor or use an email address as the database owner identifier.
3. Obtain a fresh owner-authorized workspace export and store it privately at `exports/sites-workspace.json`; the source API must remain private. The normalizer accepts the supported workspace/automation response or decoded D1 table equivalent containing purchases and observations. Keep these files outside Git, and do not print their contents into chat.
4. Normalize just the selected source owner's records:

   ```sh
   node scripts/export-shopping-data.mjs --input exports/sites-workspace.json --output exports/mirana-owner-export.json --source-user private-owner
   ```

   Use the actual source user ID if the Sites records already belong to a signed-in Google identity rather than `private-owner`.

   The normalized archive already exists from preparation. Use it directly if the source is unchanged; the exporter deliberately refuses to overwrite it. For a fresh export choose a new output filename rather than overwriting the secured backup.

5. Import into the new database under the already signed-in owner's Google subject:

   ```sh
   node scripts/import-shopping-data.mjs --input exports/mirana-owner-export.json --owner-sub YOUR_VERIFIED_GOOGLE_SUBJECT
   ```

   The scripts load `.env.local`; verify it points to the intended target database. The exporter refuses to overwrite an existing output and writes owner-only files. The importer refuses collisions and writes atomically. Imported shopping items are paused and alerts disabled until the owner reviews and reopens them. Sessions, OAuth state, notification logs and credentials are excluded. Review the exporter output and script validation before transferring any multi-user data; this is an explicit one-owner transfer, not an automatic reassignment of an entire database.

6. Inspect the new owner's shopping list, reports and comparable observations. Verify counts and representative records privately. Confirm another Google account cannot read or edit the imported data. Keep the old export as a private backup until validation succeeds. The new Google sign-in flow does not automatically adopt private-owner records; the explicit verified-subject import is required.

Do not expose database URLs with embedded credentials, tokens, raw exports or downloaded OAuth secrets. The repository ignores environment files, local database files and `exports/`; avoid placing private backups anywhere publicly deployed.

## Cutover and rollback

Keep both targets separate during validation. New target alerts stay off while old preview research remains available. Once the Vercel URL, OAuth callback, database writes, account isolation, protected dispatcher and delivery behavior are verified, reopen chosen shopping items and select supported alert intervals.

At cutover, disable the old Sites schedule to avoid duplicate research, then enable exactly one new scheduler. This step has not been performed during preparation. Retain the old owner-private preview and D1 data for rollback. If the target fails, pause its scheduler and alerts, return to the preserved preview, and investigate without replacing or deleting saved records.

A public multi-user launch requires verified Google isolation and independent worker credentials. Publishing the frontend never authorizes anonymous access to shopping data or the privileged machine APIs. Email and research remain unconnected until their credentials and real results are verified. Automatic deal emails also require a separately implemented or connected actual checkout-verification service; see [OFFER_VERIFIER.md](OFFER_VERIFIER.md). The portable worker's default web research and provisional listing prices cannot qualify an email.
