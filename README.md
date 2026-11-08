# Loaner cars

Cloudflare Worker + D1 for the Consumers Auto Warehouse loaner fleet: check-out / check-in agreements,
reservations, calendar, history. Live at **https://loaners.drivecaw.com**.

## Where this came from
The original React source was not kept. This repo was rebuilt on Nov 8, 2026 from what was live:
- `public/` — the built app exactly as it was deployed (Vite bundle). To change the UI, edit the bundle
  or rebuild the front end from scratch; there is no React source here.
- `src/worker.js` — rewritten. Same `/api/state/<key>` behaviour as before; the shared password was replaced
  with Cloudflare Access (Google login), and `/api/summary` was added.

## How it works
- The app keeps all data as three JSON documents in D1 table `app_state`:
  `loanerVehicles2`, `loanerAgreements2`, `loanerReservations2`. `PUT` uses optimistic concurrency
  (`baseVersion` must match `updated_at`, else 409 with the current value).
- **Login:** Cloudflare Access on `loaners.drivecaw.com` (Google, `@cawcaw.com` / `@valleycarcredit.com`).
  The Worker re-verifies the Access JWT on every request.
- **`GET /api/summary`** — past-due loaners (≥1 day past the due date, not checked in) and inspections /
  plates expired or expiring within 30 days. Car, plate and dates only — no customer details.
  Readable by staff and by the Access service token(s) listed in `SUMMARY_CLIENT_IDS`; the service token
  can't reach anything else. Used by the 7:45 AM "CAW Daily" Slack DM.
- `workers.dev` is off — only the custom domain (which Access protects) serves the app.

## One-time setup (Cloudflare dashboard)
1. Zero Trust → Access → Applications → **Add an application** → Self-hosted.
   Name `Loaner cars`, domain `loaners.drivecaw.com`.
2. Policy 1 "Staff": Allow, Include → Emails ending in `@cawcaw.com` and `@valleycarcredit.com`.
   Login method Google (same as the recon tracker).
3. Zero Trust → Access → Service credentials → **Create service token** `caw-daily-report`.
   Copy the Client ID and Client Secret (the secret is shown once).
4. Back on the Loaner cars app: Policy 2 "Morning report": action **Service Auth**,
   Include → Service Token → `caw-daily-report`.
5. Copy the app's **Application Audience (AUD) tag** into `wrangler.jsonc` → `ACCESS_AUD`, and the
   service token's Client ID into `SUMMARY_CLIENT_IDS`. Then deploy.

## Deploy (office PC, Command Prompt)
```
cd /d "%USERPROFILE%\Documents\loaner-management" && git pull && npm install && npx wrangler deploy
```
First time: `git clone https://github.com/consumersauto/loaner-management "%USERPROFILE%\Documents\loaner-management"`.

## Test
`npm test` (summary logic). Local: `.dev.vars` with `DEV_MODE=1` signs you in as a test user under `npx wrangler dev`.
