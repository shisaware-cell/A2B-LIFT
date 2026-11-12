# ROYI production release — 12 November 2026

Integration commit cc80cdd deployed through the existing Railway production branch. GitHub deployment status succeeded. Public page `https://a2blift.com/buy-celbux.html` returned HTTP 200. `/api/otc/config` returned HTTP 200 with ready=false, no configured asset list and an explicit provider-onboarding message. Real crypto purchases remain disabled.

A follow-up frontend change adds a local bundled QR renderer for verified unexpired deposit addresses and replaces an additional blocking browser confirmation with the explicit inline quote/phone/network consent already shown on the page. No real provider order, funding transfer, voucher issue, agreement signature, wallet credit or membership activation was performed.

The enabled quote UI was viewed with explicitly labelled local QA fixtures. Native browser confirmation stalled during order testing; the redundant native dialog was removed. Authenticated HTTP tests verified the complete order path using test-only provider responses; provider processing is not live-tested while paused. The unavailable checkout and admin readiness/empty ledgers were visually inspected.

Matric dance release is separately live: website/backend verified before client OTA group 72fccc1e-e8d5-42e4-a524-2cc72ff2ce9c for both iOS and Android.
