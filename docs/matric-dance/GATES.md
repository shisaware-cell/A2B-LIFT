# Matric dance booking acceptance
Scope: dedicated mobile and website details/booking pages, premium-only persisted quote requests, client and admin dashboards, two generated images.

- [x] G1: Premium-only categories, passenger capacity, future South Africa date/time, return time and contact validation pass behavioral tests.
  EVIDENCE: node --import tsx --test server/matric-dance.test.ts passed. Includes invalid calendar date, forbidden budget/van, over-capacity, past pickup, malformed phone, next-day return.
- [x] G2: Authenticated requests persist, users see only their own; admin can review/update requests without creating a paid/confirmed ride automatically.
  EVIDENCE: Real HTTP/JWT tests passed owner/admin guards, initial requested status, quote requirements, stale revision rejection, acceptance, confirmation and cancellation. Temporary PGlite integration passed JSON/decimal persistence, reopen, revision conflicts, RLS and anonymous read denial. No production records changed.
- [x] G3: Dedicated mobile route and website details page are reachable; forms submit real API requests and handle loading, errors and empty states.
  EVIDENCE: Client home link and wrapper route exported successfully for iOS and Android. Website form submitted to actual Express routes and temporary PostgreSQL in browser QA. Mobile interaction itself was not run in a native simulator.
- [x] G4: Website client dashboard lists requests and admin dashboard reviews requests with safe rendering.
  EVIDENCE: Browser QA: request received in customer dashboard, same itinerary reviewed in admin, quote issued, quote and terms appeared in customer dashboard, quote accepted with awaiting-confirmation status. Customer fields rendered with textContent/createTextNode.
- [x] G5: Two original images are saved in the workspace, integrated and visually inspected.
  EVIDENCE: Sedan and V-Class images generated and copied to app and website assets. Both loaded on rendered page. 390px viewport showed full subjects and no horizontal overflow. See image-prompts.md and website previews.
- [x] G6: Backend build, scoped checks, mobile export and rendered website checks pass; deployment status is stated accurately.
  EVIDENCE: npm run build passed; final independent iOS and Android exports passed at /tmp/a2b-matric-ios and /tmp/a2b-matric-android. JS syntax, TSX parsing, git diff --check passed. Repository-wide tsc still reports existing errors; none name the new matric files. Combined export stopped without diagnostics; serial final native exports passed. No production deployment or matric OTA published. Release backend/website before client OTA.
