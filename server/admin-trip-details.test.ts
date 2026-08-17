import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routesSource = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
const adminSource = fs.readFileSync(path.join(process.cwd(), "server/templates/admin.html"), "utf8");

test("admin trip history is protected, paginated and indexed", () => {
  assert.match(routesSource, /"\/api\/admin\/trips"[\s\S]*?requireRole\(\["admin"\]\)/);
  assert.match(routesSource, /LIMIT \$\{limitParam\} OFFSET \$\{offsetParam\}/);
  assert.match(routesSource, /idx_rides_status_created_at/);
  assert.doesNotMatch(adminSource.slice(adminSource.indexOf("async function loadRides"), adminSource.indexOf("// ── PAYMENTS")), /apiFetch\('\/api\/rides'\)/);
});

test("admin exposes a dedicated trip details view and lazy detail endpoint", () => {
  assert.match(routesSource, /"\/api\/admin\/trips\/:id"/);
  assert.match(adminSource, /id="view-tripDetail"/);
  assert.match(adminSource, /function openTripDetails/);
  assert.match(adminSource, /Route and stops/);
  assert.match(adminSource, /Payment records/);
  assert.match(adminSource, /Audit and safety/);
});

test("admin can see online and offline driver totals", () => {
  assert.match(routesSource, /offlineChauffeurs:/);
  assert.match(adminSource, /online · \$\{s\.offlineChauffeurs/);
});

test("admin email updates use the shared validator and uniqueness guard", () => {
  assert.match(routesSource, /"\/api\/admin\/users\/:id\/email"/);
  assert.match(routesSource, /validateEmailAddress\(req\.body\?\.email\)/);
  assert.match(routesSource, /assertUserIdentityAvailable\(\{ email: validation\.normalized, excludeUserId: user\.id \}\)/);
  assert.match(adminSource, /function saveAdminEmail/);
});

test("driver navigation voice has a persistent mute control", () => {
  const dashboardSource = fs.readFileSync(path.join(process.cwd(), "app/chauffeur/index.tsx"), "utf8");
  const settingsSource = fs.readFileSync(path.join(process.cwd(), "app/chauffeur/settings.tsx"), "utf8");
  assert.match(settingsSource, /Navigation voice/);
  assert.match(settingsSource, /persistNavigationVoiceEnabled/);
  assert.match(dashboardSource, /if \(navigationVoiceEnabled !== true\)/);
});
