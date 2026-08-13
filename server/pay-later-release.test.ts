import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routesSource = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
const clientSource = fs.readFileSync(path.join(process.cwd(), "app/client/index.tsx"), "utf8");
const applicationSource = fs.readFileSync(path.join(process.cwd(), "app/client/pay-later.tsx"), "utf8");
const adminSource = fs.readFileSync(path.join(process.cwd(), "server/templates/admin.html"), "utf8");

test("allows every rider to apply while requiring all Pay Later documents", () => {
  assert.doesNotMatch(routesSource, /Approved Lift Club membership is required before applying for Pay Later/);
  assert.match(routesSource, /eligible: true/);
  for (const type of ["id_copy", "employment_contract", "payslip", "proof_of_address"]) {
    assert.match(routesSource, new RegExp(`pay_later:${type}`));
    assert.match(applicationSource, new RegExp(`pay_later:${type}`));
  }
});

test("keeps Pay Later credit separate and reserves it before dispatch", () => {
  assert.match(routesSource, /reservePayLaterCredit\(clientId, ride\.id, safeFare\)/);
  assert.ok(
    routesSource.indexOf("reservePayLaterCredit(clientId, ride.id, safeFare)") <
    routesSource.indexOf("dispatchNextRideOffer(enrichedRide)"),
  );
  assert.match(routesSource, /refundPayLaterCredit\(rideBeforeUpdate\.clientId/);
  assert.match(applicationSource, /separate from your A2B wallet/);
});

test("all riders see Pay Later and admin can review and credit", () => {
  const paymentPickerStart = clientSource.indexOf("{/* Payment Method Picker */}");
  const paymentPickerEnd = clientSource.indexOf("{/* Location Picker Modal */}", paymentPickerStart);
  const paymentPickerSource = clientSource.slice(paymentPickerStart, paymentPickerEnd);

  assert.match(clientSource, /apiRequest\("GET", "\/api\/pay-later\/me"\)/);
  assert.doesNotMatch(paymentPickerSource, /isLiftClubMember \? \(/);
  assert.match(clientSource, /handlePayAndRide\("pay_later"\)/);
  assert.doesNotMatch(applicationSource, /Lift Club approval required/);
  assert.match(adminSource, /go\('payLater'/);
  assert.match(adminSource, /\/api\/admin\/pay-later\/.*\/credit/);
  assert.match(adminSource, /deletePayLaterDocument/);
});
