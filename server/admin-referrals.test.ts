import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routesSource = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
const adminSource = fs.readFileSync(path.join(process.cwd(), "server/templates/admin.html"), "utf8");

test("admin referrals endpoint is protected and uses the durable user relationship", () => {
  assert.match(
    routesSource,
    /app\.get\("\/api\/admin\/referrals", requireAuth, requireRole\(\["admin"\]\)/,
  );
  assert.match(routesSource, /INNER JOIN users referrer ON referrer\.id = referred\.referred_by_user_id/);
  assert.match(routesSource, /LEFT JOIN referral_events event ON event\.referred_user_id = referred\.id/);
  assert.match(routesSource, /WHERE referred\.referred_by_user_id IS NOT NULL/);
  assert.doesNotMatch(
    routesSource.slice(
      routesSource.indexOf('app.get("/api/admin/referrals"'),
      routesSource.indexOf('app.get("/api/users/:id"'),
    ),
    /referrer\.password|referred\.password/,
  );
});

test("admin dashboard exposes referral totals, search, links, and account details", () => {
  assert.match(adminSource, /id="view-referrals"/);
  assert.match(adminSource, /Who Referred Who/);
  assert.match(adminSource, /apiFetch\('\/api\/admin\/referrals'\)/);
  assert.match(adminSource, /id="referral-search"/);
  assert.match(adminSource, /copyReferralLink/);
  assert.match(adminSource, /openReferralUser/);
  assert.match(adminSource, /Rewards Paid/);
});
