# Ride Operations and Approval Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settle each ordinary and long-distance ride fairly from a stored quote, add demand, waiting, cancellation, payment-adjustment, and notification operations, and complete the driver, vehicle, and partner approval controls.

**Architecture:** Ride pricing will be calculated and stored on the server at request time, then settled from driver-recorded journey events. A small policy module owns demand, waiting, and cancellation calculations so the API handlers and mobile UI share one set of rules. Admin approvals remain backed by existing operator, vehicle, and document records, with an explicit document-review state and vehicle waitlist lifecycle.

**Tech Stack:** TypeScript, Express, Drizzle/Postgres, Expo Router/React Native, Paystack, Expo Push Notifications, existing static admin dashboard.

---

### Task 1: Add a test harness and pure ride-operation policies

**Files:**
- Modify: `package.json`
- Create: `server/ride-operations-policy.ts`
- Create: `server/ride-operations-policy.test.ts`

- [ ] **Step 1: Add a failing policy test for the five-minute grace period and R30 cap.**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { calculateWaitingFee } from "./ride-operations-policy";

test("charges R1 per started minute after the five minute arrival grace period, capped at R30", () => {
  assert.equal(calculateWaitingFee(5), 0);
  assert.equal(calculateWaitingFee(5.01), 1);
  assert.equal(calculateWaitingFee(40), 30);
});
```

- [ ] **Step 2: Run the test before implementation.**

Run: `npm test -- server/ride-operations-policy.test.ts`

Expected: FAIL because `ride-operations-policy` does not exist.

- [ ] **Step 3: Implement the smallest policy API.**

```ts
export const WAITING_GRACE_MINUTES = 5;
export const WAITING_RATE_CENTS_PER_MINUTE = 100;
export const WAITING_CAP_CENTS = 3000;

export function calculateWaitingFee(minutesSinceArrival: number): number {
  const chargedMinutes = Math.max(0, Math.ceil(minutesSinceArrival - WAITING_GRACE_MINUTES));
  return Math.min(chargedMinutes * WAITING_RATE_CENTS_PER_MINUTE, WAITING_CAP_CENTS);
}
```

- [ ] **Step 4: Extend tests for the 1.5x demand cap and rider cancellation policy, then implement `calculateDemandMultiplier` and `calculateRiderCancellationFee`.**

```ts
assert.equal(calculateDemandMultiplier({ searchingRides: 3, onlineDrivers: 1, adminCap: 1.5 }), 1.5);
assert.equal(calculateRiderCancellationFee({ minutesDrivingToPickup: 2.9, baseFareCents: 4500, waitingFeeCents: 0 }), 0);
assert.equal(calculateRiderCancellationFee({ minutesDrivingToPickup: 3, baseFareCents: 4500, waitingFeeCents: 1200 }), 5700);
```

- [ ] **Step 5: Run the policy suite and commit.**

Run: `npm test -- server/ride-operations-policy.test.ts`

Expected: PASS.

Commit: `git add package.json server/ride-operations-policy.ts server/ride-operations-policy.test.ts && git commit -m "test: define ride operation policies"`

### Task 2: Store quotes, settlement, location evidence, and delivery logs

**Files:**
- Modify: `shared/schema.ts`
- Modify: `server/storage.ts`
- Create: `shared/ride-operations.ts`

- [ ] **Step 1: Add a failing storage/policy test that requires a quote snapshot to retain base fare, distance fare, demand multiplier, final fare, waiting fee, cancellation fee, and settlement status.**

```ts
const quote = createRideQuote({ baseFareCents: 4500, distanceFareCents: 12000, demandMultiplier: 1.25 });
assert.equal(quote.quotedFareCents, 20625);
assert.equal(quote.status, "quoted");
```

- [ ] **Step 2: Run the new test and confirm it fails because `createRideQuote` is missing.**

Run: `npm test -- server/ride-operations-policy.test.ts`

Expected: FAIL with missing export.

- [ ] **Step 3: Add database fields/tables.**

Add nullable, backwards-compatible ride columns for `quotedFare`, `demandMultiplier`, `actualDistanceKm`, `waitingFee`, `cancellationFee`, `finalFare`, `settlementStatus`, `arrivedAt`, and `pickupTravelStartedAt`. Add `ride_location_samples`, `payment_adjustments`, `pricing_settings`, `push_delivery_logs`, and `admin_audit_logs` tables with ride/user foreign keys and created timestamps. Add storage methods that write and read these records.

- [ ] **Step 4: Add `createRideQuote` and run the policy suite.**

Run: `npm test -- server/ride-operations-policy.test.ts`

Expected: PASS.

- [ ] **Step 5: Apply the schema using the existing Drizzle workflow and commit.**

Run: `npm run db:push`

Expected: schema accepted by the configured database.

Commit: `git add shared/schema.ts shared/ride-operations.ts server/storage.ts && git commit -m "feat: store ride settlement operations"`

### Task 3: Quote, demand, arrival, and final-fare server lifecycle

**Files:**
- Modify: `server/luxuryPricingEngine.ts`
- Modify: `server/routes.ts`
- Modify: `server/ride-operations-policy.test.ts`

- [ ] **Step 1: Add failing tests for an estimate that exposes `demandMultiplier` and a ride request that ignores a client-provided `actualFare`.**

```ts
assert.equal(buildEstimate({ baseFareCents: 10000, demandMultiplier: 1.5 }).quotedFareCents, 15000);
assert.notEqual(createRideBody.actualFare, storedRide.price);
```

- [ ] **Step 2: Run the tests and verify the current client-controlled fare behavior fails them.**

Run: `npm test -- server/ride-operations-policy.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement server-owned pricing.**

`POST /api/pricing/estimate` and `POST /api/rides` calculate the demand multiplier from nearby searching rides and online approved drivers, cap it at the stored admin cap (default 1.5), and persist the quote. The multiplier is frozen for that ride. The ride API never accepts client `actualFare` as a settlement amount.

- [ ] **Step 4: Implement journey events.**

Add authenticated driver endpoints for `pickup-travel-started`, `arrived`, `location-sample`, and `completed`. Require the assigned/approved driver, record timestamps and coordinates, and calculate final fare from actual sampled distance, preserving the quote's demand multiplier. Daily Lift Club rides are excluded from this lifecycle.

- [ ] **Step 5: Run unit tests and the server build.**

Run: `npm test -- server/ride-operations-policy.test.ts && npm run build`

Expected: PASS and successful bundle.

Commit: `git add server/luxuryPricingEngine.ts server/routes.ts server/ride-operations-policy.test.ts && git commit -m "feat: quote and settle ordinary rides"`

### Task 4: Payment adjustment and cancellation ledger

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/storage.ts`
- Modify: `server/ride-operations-policy.test.ts`

- [ ] **Step 1: Add failing tests for card settlement increase, card refund decrease, cash negative balance, and driver cancellation.**

```ts
assert.deepEqual(resolveCancellation({ actor: "driver", paymentMethod: "cash" }), { feeCents: 0, cashDebtCents: 0 });
assert.deepEqual(resolveCancellation({ actor: "rider", paymentMethod: "cash", minutesDrivingToPickup: 3, baseFareCents: 4500 }), { feeCents: 4500, cashDebtCents: 4500 });
```

- [ ] **Step 2: Run the tests and confirm failure.**

Run: `npm test -- server/ride-operations-policy.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement idempotent settlement.**

Use a unique payment-adjustment record before calling Paystack. On card/wallet payments, collect a positive difference using the saved authorization or refund a negative difference through Paystack. For cash, record the final fare for the driver and add cancellation debt to the rider wallet/balance. Riders with outstanding cash cancellation debt cannot request another ride. Do not create both a Paystack refund and an additional wallet refund for the same amount.

- [ ] **Step 4: Replace generic cancellation status mutation with an actor-aware endpoint.**

The route records who cancelled. A rider pays the base fare only after three minutes of driver travel, and a no-show after arrival includes base fare plus waiting fee. Driver cancellation has no customer charge and returns any eligible prepayment once.

- [ ] **Step 5: Run tests and server build, then commit.**

Run: `npm test -- server/ride-operations-policy.test.ts && npm run build`

Expected: PASS.

Commit: `git add server/routes.ts server/storage.ts server/ride-operations-policy.test.ts && git commit -m "feat: settle ride changes and cancellations"`

### Task 5: Driver and rider operational UI

**Files:**
- Modify: `app/chauffeur/index.tsx`
- Modify: `app/client/index.tsx`
- Modify: `app/client/rides.tsx`
- Modify: `lib/query-client.ts`

- [ ] **Step 1: Add tests/helpers for route status labels showing high demand, arrival waiting state, and a post-cancellation cash debt block.**

```ts
assert.equal(getDemandLabel(1.5), "High demand");
assert.equal(canRequestRide({ outstandingCancellationDebtCents: 100 }), false);
```

- [ ] **Step 2: Run the tests and confirm failing imports.**

Run: `npm test -- server/ride-operations-policy.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement mobile API calls and state.**

The driver app sends journey start, arrival, and periodic active-ride location samples; it displays the waiting charge after the grace period. The rider app displays the quoted price, a visible `High demand` explanation only when the multiplier exceeds 1, final amount/refund/extra charge after settlement, and the cancellation fee before confirmation. The request screen blocks rides with unpaid cash cancellation debt.

- [ ] **Step 4: Run TypeScript lint/build checks available in the repo.**

Run: `npx tsc --noEmit && npm run build`

Expected: successful type check and server build.

Commit: `git add app/chauffeur/index.tsx app/client/index.tsx app/client/rides.tsx lib/query-client.ts server/ride-operations-policy.test.ts && git commit -m "feat: show ride settlement states in apps"`

### Task 6: Reconcile approved drivers and make approval documents actionable

**Files:**
- Modify: `server/storage.ts`
- Modify: `server/routes.ts`
- Modify: `app/chauffeur/vehicles.tsx`
- Modify: `server/templates/admin.html`
- Modify: `server/ride-operations-policy.test.ts`

- [ ] **Step 1: Add a failing regression test for an approved chauffeur with a stale pending driver operator profile.**

```ts
assert.equal(reconcileDriverProfile({ profileStatus: "pending", chauffeurApproved: true }).status, "approved");
assert.equal(reconcileDriverProfile({ profileType: "partner", profileStatus: "pending", chauffeurApproved: true }).status, "pending");
```

- [ ] **Step 2: Run the test and confirm failure.**

Run: `npm test -- server/ride-operations-policy.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the narrowly-scoped reconciliation.**

`ensureDriverOperatorForChauffeur` upgrades only an existing `driver` profile when the linked chauffeur is approved. Vehicle create/read/select handlers use the reconciled driver profile so an already-approved driver can add a vehicle. Partner profiles are never upgraded by this path.

- [ ] **Step 4: Add document workflow controls.**

The admin dashboard gains a Documents portal with driver, partner, and vehicle filters, preview/open links, `Approve/Activate` and `Reject` actions, mandatory rejection reason, and reviewed status. Vehicle approval is rejected by the server unless every required vehicle document is approved. The Partner view shows the same actionable partner document review modal.

- [ ] **Step 5: Run tests and build, then commit.**

Run: `npm test -- server/ride-operations-policy.test.ts && npm run build`

Expected: PASS.

Commit: `git add server/storage.ts server/routes.ts app/chauffeur/vehicles.tsx server/templates/admin.html server/ride-operations-policy.test.ts && git commit -m "fix: reconcile drivers and review approval documents"`

### Task 7: Vehicle waitlisting, push delivery visibility, and secure admin password controls

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/storage.ts`
- Modify: `server/templates/admin.html`
- Modify: `app/chauffeur/notifications.tsx`
- Modify: `app/chauffeur/vehicles.tsx`
- Modify: `server/ride-operations-policy.test.ts`

- [ ] **Step 1: Add failing tests for vehicle waitlist transition and a required reason.**

```ts
assert.throws(() => validateWaitlist({ entity: "vehicle", reason: "" }), /reason is required/i);
assert.equal(nextVehicleStatus({ action: "waitlist" }), "waitlisted");
```

- [ ] **Step 2: Run tests and confirm failure.**

Run: `npm test -- server/ride-operations-policy.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement vehicle waitlist lifecycle.**

Allow `waitlisted` in vehicle state validation. The admin action requires a reason, takes the vehicle out of service, removes active assignments, sets an affected active driver offline, creates notification/push records, and shows a Reactivate button. Reactivation requires an explicit admin action and retains document review requirements.

- [ ] **Step 4: Record notification delivery and enable admin testing.**

Persist Expo push ticket IDs and receipt outcome, expose them in the admin dashboard, and add a send-test action that only targets the selected user's stored Expo tokens.

- [ ] **Step 5: Add secure password administration.**

Use the existing reset-token flow or a generated one-time temporary password that forces password change. Never return, display, or log password hashes. Log the admin action.

- [ ] **Step 6: Run all tests, build, and commit.**

Run: `npm test -- server/ride-operations-policy.test.ts && npx tsc --noEmit && npm run build`

Expected: PASS.

Commit: `git add server/routes.ts server/storage.ts server/templates/admin.html app/chauffeur/notifications.tsx app/chauffeur/vehicles.tsx server/ride-operations-policy.test.ts && git commit -m "feat: operate waitlists and notification delivery"`

### Task 8: Final verification and release handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-06-22-ride-operations-and-approval-controls.md`

- [ ] **Step 1: Run the full test and type/build suite.**

Run: `npm test && npx tsc --noEmit && npm run build`

Expected: all tests pass, no TypeScript errors, and a successful `server_dist/index.js` build.

- [ ] **Step 2: Verify the changed files contain no client-controlled settlement amount, no exposed password fields, and no unreviewed vehicle approval route.**

Run: `rg -n "actualFare|password|vehicle.*status" server/routes.ts server/templates/admin.html shared/schema.ts`

Expected: all actual-fare inputs are ignored at settlement, passwords are handled only as hashes/reset values, and vehicle approval validates documents.

- [ ] **Step 3: Commit the plan checklist update and push the isolated branch.**

Commit: `git add docs/superpowers/plans/2026-06-22-ride-operations-and-approval-controls.md && git commit -m "docs: record ride operations delivery plan"`

Push: `git push -u origin codex/ride-operations`
