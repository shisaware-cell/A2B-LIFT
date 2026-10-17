import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveAppVariant } from "../packages/mobile-core/src/app-variant-resolver";
import { normalizePhoneIdentity } from "./user-identity";

test("client and rider accounts created on the website can be used directly on the client mobile app", () => {
  const websiteLoginSource = fs.readFileSync(path.resolve(__dirname, "../website/login.html"), "utf8");
  const routesSource = fs.readFileSync(path.resolve(__dirname, "./routes.ts"), "utf8");
  const storageSource = fs.readFileSync(path.resolve(__dirname, "./storage.ts"), "utf8");
  const clientAppConfig = fs.readFileSync(path.resolve(__dirname, "../apps/client-mobile/app.config.js"), "utf8");
  const appVariantSource = fs.readFileSync(path.resolve(__dirname, "../packages/mobile-core/src/app-variant.ts"), "utf8");

  // 1. Website registration submits role: 'client' to /api/auth/register
  assert.match(websiteLoginSource, /role:\s*['"]client['"]/);
  assert.match(websiteLoginSource, /\/api\/auth\/register/);

  // 2. Client app configuration targets variant 'client'
  assert.match(clientAppConfig, /variant:\s*["']client["']/);

  // 3. Client variant resolves to "/client" home route (the Rider map and dashboard)
  assert.equal(resolveAppVariant("com.a2blift.client"), "client");
  assert.match(appVariantSource, /if\s*\(variant\s*===\s*["']client["']\)\s*return\s*["']\/client["']/);

  // 4. Backend login supports finding user by email/username or phone number
  assert.match(routesSource, /getUserByUsernameOrPhone/);
  assert.match(storageSource, /getUserByPhone/);
  assert.match(storageSource, /getUserByUsernameOrPhone/);
});

test("admin dashboard allows creating client/rider accounts with instant website and mobile app access", () => {
  const adminHtml = fs.readFileSync(path.resolve(__dirname, "./templates/admin.html"), "utf8");
  const routesSource = fs.readFileSync(path.resolve(__dirname, "./routes.ts"), "utf8");

  // 1. Backend provides POST /api/admin/users
  assert.match(routesSource, /app\.post\(\s*["']\/api\/admin\/users["']/);

  // 2. Admin dashboard has + Add Client / Rider button and modal
  assert.match(adminHtml, /openAddUserModal/);
  assert.match(adminHtml, /\+ Add Client \/ Rider/);
  assert.match(adminHtml, /submitAddUser/);
  assert.match(adminHtml, /\/api\/admin\/users/);
});

test("Google OAuth preserves client mobile app scheme (a2bliftclient://)", () => {
  const routesSource = fs.readFileSync(path.resolve(__dirname, "./routes.ts"), "utf8");
  const sharedConfig = fs.readFileSync(path.resolve(__dirname, "../app.config.shared.js"), "utf8");

  // Client scheme is a2bliftclient
  assert.match(sharedConfig, /scheme:\s*["']a2bliftclient["']/);

  // Routes allow a2bliftclient:// redirects
  assert.match(routesSource, /a2bliftclient:\/\//);
});

test("phone number normalization supports multiple South African formats for login", () => {
  assert.equal(normalizePhoneIdentity("0821234567"), "27821234567");
  assert.equal(normalizePhoneIdentity("+27 82 123 4567"), "27821234567");
  assert.equal(normalizePhoneIdentity("27821234567"), "27821234567");
  assert.equal(normalizePhoneIdentity("0710000000"), "27710000000");
});
