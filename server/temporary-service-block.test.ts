import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  TEMPORARY_SERVICE_BLOCK,
  TEMPORARY_SERVICE_BLOCK_MESSAGE,
} from "../lib/maintenance-config";

test("temporary service block configuration is lifted (false) allowing users to log in", () => {
  assert.equal(TEMPORARY_SERVICE_BLOCK, false, "TEMPORARY_SERVICE_BLOCK must be false when block is lifted");
  assert.equal(
    TEMPORARY_SERVICE_BLOCK_MESSAGE,
    "Temporarily unavailable, try again later",
    "Message must match 'Temporarily unavailable, try again later'",
  );
});

test("mobile core exports maintenance configuration", () => {
  const indexSource = fs.readFileSync(path.resolve(__dirname, "../packages/mobile-core/src/index.ts"), "utf8");
  const maintenanceSource = fs.readFileSync(path.resolve(__dirname, "../packages/mobile-core/src/maintenance.ts"), "utf8");

  assert.match(indexSource, /export \* from "\.\/maintenance"/);
  assert.match(maintenanceSource, /export \* from "\.\.\/\.\.\/\.\.\/lib\/maintenance-config"/);
});

test("auth context clears local sessions and blocks login and registration when service block is active", () => {
  const authSource = fs.readFileSync(path.resolve(__dirname, "../lib/auth-context.tsx"), "utf8");

  // Verify loadUser clears session when block is active
  assert.match(authSource, /if \(TEMPORARY_SERVICE_BLOCK\) \{\s*try \{\s*await clearLocalSession\(\);/);

  // Verify user change effect clears session if user state is non-null
  assert.match(authSource, /if \(TEMPORARY_SERVICE_BLOCK && user\) \{\s*void clearLocalSession\(\);/);

  // Verify login throws exact required message
  assert.match(authSource, /async function login[\s\S]*?\{\s*if \(TEMPORARY_SERVICE_BLOCK\) \{\s*throw new Error\(TEMPORARY_SERVICE_BLOCK_MESSAGE\);/);

  // Verify register throws exact required message
  assert.match(authSource, /async function register[\s\S]*?\{\s*if \(TEMPORARY_SERVICE_BLOCK\) \{\s*throw new Error\(TEMPORARY_SERVICE_BLOCK_MESSAGE\);/);
});

test("login screen prevents submission and displays 'Temporarily unavailable, try again later'", () => {
  const loginSource = fs.readFileSync(path.resolve(__dirname, "../app/login.tsx"), "utf8");

  // Verify handleLogin blocks immediately with message and Alert
  assert.match(loginSource, /async function handleLogin\(\) \{\s*if \(TEMPORARY_SERVICE_BLOCK\) \{\s*setError\(TEMPORARY_SERVICE_BLOCK_MESSAGE\);/);

  // Verify Google sign-in is also blocked
  assert.match(loginSource, /async function handleGoogleSignIn\(\) \{\s*if \(TEMPORARY_SERVICE_BLOCK\) \{\s*setError\(TEMPORARY_SERVICE_BLOCK_MESSAGE\);/);

  // Verify password reset is also blocked
  assert.match(loginSource, /async function handlePasswordResetRequest\(\) \{\s*if \(TEMPORARY_SERVICE_BLOCK\) \{\s*setError\(TEMPORARY_SERVICE_BLOCK_MESSAGE\);/);
});

test("register screen blocks registration and displays 'Temporarily unavailable, try again later'", () => {
  const registerSource = fs.readFileSync(path.resolve(__dirname, "../app/register.tsx"), "utf8");

  // Verify handleRegister blocks immediately with message and Alert
  assert.match(registerSource, /async function handleRegister\(\) \{\s*if \(TEMPORARY_SERVICE_BLOCK\) \{\s*setError\(TEMPORARY_SERVICE_BLOCK_MESSAGE\);/);
});

test("app layout auth gate redirects protected screens to landing when block is active", () => {
  const layoutSource = fs.readFileSync(path.resolve(__dirname, "../app/_layout.tsx"), "utf8");

  assert.match(layoutSource, /if \(TEMPORARY_SERVICE_BLOCK\) \{\s*if \(user\) \{\s*clearSession\(\)\.catch\(\(\) => \{\}\);\s*\}\s*if \(isProtected\) \{\s*router\.replace\("\/"\);\s*\}\s*return;\s*\}/);
});
