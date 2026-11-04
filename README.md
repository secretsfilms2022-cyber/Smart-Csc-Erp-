# Smart CSC ERP

Production ERP for Smart CSC Gorakhpur.

## Source recovery
The live Cloudflare Worker `smart-csc-erp` was imported into sequential source parts under `src/` and assembled by `npm run build`.

Live source SHA-256 at import time:
`ce901bfad1d5126bdb7cd2bdd1ca59d2c9462576473889c4ef6f15dc1d464877`

## Stack
- Cloudflare Workers
- Supabase PostgreSQL/Auth
- Razorpay payment links
- Gemini AI integration
- Professional invoicing
- Central ledger / financial synchronization
- Customer communications
- Face recognition module

## Local checks
```
npm run check
```

## Deployment
GitHub Actions deploys `smart-csc-erp` to Cloudflare Workers after the required repository secrets are configured.

Required GitHub Actions secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Required Cloudflare Worker secrets remain in Cloudflare and must never be committed:
- `GEMINI_API_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

Do not commit Supabase service-role/secret keys. The client-facing Supabase publishable key is intentionally part of the current live application.

## Atomic Mail ERP integration

The ERP now includes a server-side Atomic Mail bridge and an upgraded Communication Center for the mailbox `surajkatira@smartcsc.work.gd`.

Required Cloudflare Worker secret (never commit it):
- `ATOMIC_MAIL_API_KEY` — the API key from the Atomic Mail inbox Connect dialog.

The bridge uses the hosted Atomic Mail MCP endpoint server-side. The key is never sent to the browser.

### Current manual configuration blockers
- Add `ATOMIC_MAIL_API_KEY` to the production Worker secret store.
- Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to GitHub Actions repository secrets for automatic deployment.

The GitHub CI currently also reports a pre-existing JavaScript syntax error in the recovered monolithic Worker source; this must be repaired before a production deployment can be declared successful.
