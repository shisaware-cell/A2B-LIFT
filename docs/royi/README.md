# A2B × ROYI/Celbux website integration

## What the package is for

Reviewed `A2B_ROYI_Integration_Handover_Package.zip`, supplied 12 November 2026. It proposes a co-branded cryptocurrency-to-ZAR Celbux SMS voucher reseller service operated by ROYI/247 Technologies. The proposed agreement states a 10% customer service tariff and 1.5% A2B commission on completed conversion value. These are proposed provider terms; this implementation neither signs nor accepts the reseller agreement.

The original package remains on the Desktop. Current site files were merged, not overwritten with older handover copies. No raw agreement, banking data, private integration console or electronic-signature widget is published.

## Findings that change implementation

- Sample `server.js` seeds completed orders and payouts in memory, uses fixed exchange rates and a sample deposit address. The checkout includes simulated payment/SMS behavior. None is shipped.
- The two handover guides disagree on endpoint names (`/api/orders` versus `/api/otc/orders`) and attribution (`A2B_LIFT` versus `a2blift`). The adapter follows the newer live hooks: `/api/otc/quote`, `/api/orders`, `/api/orders/status/:id`, `siteSource: A2B_LIFT`.
- Its sample `crypto_required = voucher / rate` does not fund the separately stated 10% service fee while still delivering the full voucher. The server rejects inconsistent fee arithmetic.
- Live read-only probe: `https://usdt2celbux.com/api/otc/quote?crypto=USDT&zar_amount=200` returned HTTP 503 with `Payment service temporarily paused` on 12 November 2026. No real orders/deposits were created during implementation.
- No production partner API key, authenticated reporting contract, webhook signature specification, provider-confirmed asset/network list or transaction limits are supplied. The temporary Cloudflare demo URL and default access code are not used.
- The agreement distinguishes voucher delivery from A2B wallet credits/trip settlement/Lift Club activation. Those balances and entitlements remain on the existing real payment paths.

## Implemented

- `buy-celbux.html`: provider readiness, login, server-side quote review, recipient consent, server-issued deposit instructions with locally rendered QR (no address sent to an external QR service), expiry handling, own order history and status refresh.
- Website homepage and dashboard wallet links; own voucher-orders tab. Lift Club page explicitly treats vouchers as a separate purchase, preserving manual membership payment.
- Existing admin dashboard: connection checklist, monthly verified order ledger, all-time unpaid commission, CSV and recording of already-made settlement payments. Admin-only access; recording does not transfer funds.
- Persistent PostgreSQL quotes, idempotent quote-to-order creation, server-side attribution, provider-only status reconciliation, commission completion/reversal accounting and optimistic transactional settlement checks.
- RLS enabled on all new tables; no direct public/client policies. API uses existing JWT authentication, customer row ownership, admin role guards and rate limits. No voucher PIN is stored or exposed.

## Provider activation prerequisites

Configure server-only environment variables after the provider confirms them:

```
ROYI_ENABLED=false
ROYI_API_BASE_URL=https://usdt2celbux.com
ROYI_API_KEY=<production partner credential>
ROYI_WEBHOOK_SECRET=<at least 32 random characters agreed with ROYI>
ROYI_ASSETS_JSON=<provider-confirmed JSON array of {crypto,networks}>
ROYI_MIN_ZAR=<provider-confirmed minimum>
ROYI_MAX_ZAR=<provider-confirmed maximum>
```

No production credentials are committed. Only the two production domains named in the handover are allowed. No demo tunnel is enabled. `ready` remains false until all settings are valid and explicitly enabled; an enabled connection can still be temporarily unavailable and returns a retryable 503. After activation, test quote arithmetic/network pairs and a provider-approved non-funding test workflow before enabling actual customer purchases.

Webhook receiver: `POST /api/otc/webhook`. Required headers are `X-ROYI-Timestamp` (Unix seconds, within 5 minutes), and `X-ROYI-Signature` (`sha256=` optional prefix, hexadecimal HMAC-SHA256 of `timestamp + '.' + raw JSON body`). This verification protocol must be agreed with the provider; it is not specified in the ZIP. Signed notifications only trigger a server-to-server status fetch; their supplied payout/commission fields never credit the ledger. Completion requires matching voucher amount plus provider transaction references and payout timestamp. Retries/replays cannot earn commission twice. Unknown create-order outcomes go to `review_required`, with no automatic order-creation retry or deposit instructions.

The API stores receipt digests, not full callback PII. It does not implement wallet credits, ride-fare splits, voucher redemption or membership activation without an actual provider settlement contract. It does not call the provider payout endpoint or move commission funds.

## Verification and rollout

- `node --import tsx --test server/royi.test.ts server/matric-dance.test.ts`: JWT/role/ownership, quote arithmetic, no trusted client price/status, idempotent creation, signed callbacks, provider-only completion, existing matric workflow.
- Temporary PGlite Postgres integration: persistence, completion/reversal exactly-once accounting, duplicate settlement rollback, overpayment prevention, receipts, ownership filtering and RLS anonymous read denial. No production customer/financial records changed.
- Browser: real local API and temporary empty database show the unavailable checkout, no deposit addresses, own empty history, admin readiness checklist and empty real ledger. HTTP tests use explicit test-only provider fixtures for the enabled path.
- Existing build output is tracked and used by production, so the refreshed `server_dist/index.js` must accompany backend changes. Matric was initially missing until that bundle was deployed.
- Missing provider prerequisites prevent activation, not deployment of the verified website and backend. Production state is recorded in release-status.md.

QR bundle can be regenerated with `node scripts/build-celbux-qr.mjs` using the existing qrcode dependency. Generated browser bundle is tracked for the static site.
