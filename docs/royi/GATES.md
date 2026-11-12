# ROYI integration acceptance
- [x] Package assessed; sample/demo behavior identified, original files preserved and current site merged.
- [x] Authenticated, persistent quotes/orders, provider-only deposit instructions, idempotent creation, ownership checks.
- [x] Provider configuration and fee validation fail closed; unavailable UI has no fake rates, balances, addresses or vouchers.
- [x] Verified order reconciliation; authenticated/replay-resistant webhook only triggers server-side status verification; no A2B wallet or membership credit.
- [x] Admin-only commission reporting, CSV, immutable recorded settlements; no payout transaction initiated.
- [x] Website checkout, wallet entry, history and admin UI verified; tests and build pass.
- [x] Matric backend/website deployed and verified before its client OTA. ROYI deployment and provider blockers stated accurately.

Evidence: four authenticated HTTP/schema tests passed; PGlite PostgreSQL accounting/RLS integration passed; npm backend build and JS syntax checks passed; no new ROYI TypeScript diagnostics (repository baseline errors remain). Unavailable checkout, quote layout, admin configuration and empty real local ledger inspected in browser. Full enabled order path tested over HTTP with test fixtures; native browser confirmation stalled and was replaced by inline consent. Production checkout/API verified HTTP 200 and ready=false. Matric website/API verified live, guards verified 401, then OTA published and independently verified for both platforms. Provider purchases remain blocked by missing provider configuration and the provider's paused live service, as permitted by the requested fallback.
