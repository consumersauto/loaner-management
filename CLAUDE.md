# Loaner cars — notes for Claude

- Live at https://loaners.drivecaw.com (Cloudflare Worker `loaner-management` + D1 `loaner-management-db`).
- This repo is the source of truth. `public/` is a prebuilt Vite/React bundle — no React source exists.
- Cloud sessions can't reach the Cloudflare API. Deploy from the office PC (see README).
- Login is Cloudflare Access (team `andrew-fda`). Service tokens may only read `/api/summary`.
- Data lives as JSON blobs in `app_state` (keys loanerVehicles2 / loanerAgreements2 / loanerReservations2).
  Agreements hold driver PII (license #, address) — never put those in summaries, logs or Slack.
- Tests: `npm test`.
