# Matric dance booking

Implemented as an authenticated, quote-first event request across mobile and the website. The customer supplies an itinerary, A2B reviews it and quotes, the customer accepts the quoted terms, and A2B confirms operational arrangements. No payment, automatic driver dispatch or guaranteed model is implied by this workflow.

## Research — 12 November 2026

- [Veloce matric dance packages](https://www.veloceluxurycarrental.co.za/matric-dance-car-rental-cape-town): chauffeur transport, advance arrival/photo time, custom collection and drop-off, optional onward travel. Their specific inclusions and prices are not A2B promises.
- [Abantu inTransit Johannesburg matric dance](https://abantu-intransit.co.za/cities/johannesburg/matric-dance): vehicle availability is operator-specific, V-Class group transport and pickup arrangements.
- [V-Class hire FAQ](https://v-class.co.za/faq/): itinerary stops and passenger capacity matter; rental/self-drive deposit terms differ from chauffeured event service.

These sources support capturing school/event, date/time, pickup, venue, passenger count, photo time, requested service duration, preferred model and return collection. Supplier policies vary, so A2B must confirm inclusions, availability, payment and cancellation terms in its own quote. Minimum request notice is currently 24 hours (shared config), not a researched industry-wide rule.

## Category mapping

Use only existing fare-policy IDs: `luxury` (4), `business` / VIP (4, including E/S-Class preference), `luxury_van` / V-Class (6). S-Class is a requested model under VIP; it is not a new dispatch category or a guaranteed model. Budget, A2B Lite and ordinary Van are rejected server-side.

## Entry points

- Mobile: client home → Matric dance → dedicated details/request screen; includes own requests and quote acceptance/cancellation.
- Website: homepage navigation → `matric-dance.html`; login draft is retained locally until submission.
- Customer website dashboard: `dashboard.html#matricdance`.
- Admin: Matric dance queue; search, itinerary review, quote/decline, confirm accepted quote.

## Backend and privacy

`registerMatricDanceRoutes` is registered from the existing server. `createMatricStore` persists to `matric_dance_bookings` in PostgreSQL, with idempotent bootstrap and RLS enabled, no direct public/client-role policies. The existing server DB role must be the owner or have BYPASSRLS and CREATE/ALTER permissions for bootstrap. Normal users use the authenticated Express API and only see their own rows; admin APIs require the admin role. Parameterised SQL, Zod validation, text-only customer-data rendering, status transitions and revision checks protect requests and accepted quotes. No payment/card data is collected.

Statuses: requested → reviewing / quoted / declined; quoted → accepted / declined / revised quote; accepted → confirmed / declined. Customers may cancel unconfirmed requests. Confirmed booking changes go through A2B under the agreed terms. A stale quote revision cannot be accepted, and an accepted quote cannot be repriced during confirmation.

## Verification

- `node --import tsx --test server/matric-dance.test.ts`: real HTTP/JWT workflow, category/capacity/date/contact validation, ownership/admin guards, stale quote handling, confirmation and cancellation.
- Temporary PGlite PostgreSQL integration outside repository: table/index bootstrap, JSON persistence, decimal quotes, restart, revision conflicts, RLS and anonymous read denial. No production data was changed.
- `npm run build`: backend bundle passes. Generated tracked `server_dist/index.js` restored after validation; deployment should build it from source.
- Client Expo production exports for iOS and Android; scoped TypeScript diagnostics checked separately from existing repository errors.
- Browser QA used a temporary PostgreSQL preview and fictional local data: submit → customer dashboard → admin quote → customer acceptance. Desktop and 390px images/layout inspected. Preview screenshots are in this folder.

## Release order

This feature changes the backend, database, website and app. It cannot be delivered by OTA alone. Deploy backend/website first, verify `/api/matric-dance/options` and the authenticated/admin endpoints on production, then publish the client OTA using the existing client release guard (runtime and channel must match installed apps). Requests should remain unavailable with a retry message until the new API is deployed. No production deployment or new matric-dance OTA has been published in this implementation task.
