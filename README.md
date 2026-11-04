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
- `ATOMIC_MAIL_API_KEY` — configured in the Production `smart-csc-erp` Worker.

The bridge uses the hosted Atomic Mail MCP endpoint server-side. The key is never sent to the browser.

### Communication data model
- Existing `customer_communications` is reused for inbound/outbound email history.
- `email_templates` stores configurable transactional templates per business.
- `email_sync_state` stores incremental sync metadata and error state.
- RLS is enabled on both new tables and scoped to the authenticated user's business.

### CI/CD blocker
GitHub Actions deployment still requires repository secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The recovered Worker source also contained a missing closing delimiter at the HTML/`APP_JS` boundary. This has been repaired in GitHub and the integrity test suite now checks the Atomic Mail routes and exposed-secret guardrails. A successful GitHub Actions run and Cloudflare deployment are still required before production completion can be declared.
