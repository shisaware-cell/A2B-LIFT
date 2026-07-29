import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  hashPasswordResetToken,
  validateResetPassword,
} from "./password-reset";

test("creates a one-time password reset token without storing the raw value", () => {
  const reset = createPasswordResetToken();

  assert.ok(reset.token.length >= 40);
  assert.notEqual(reset.tokenHash, reset.token);
  assert.equal(reset.tokenHash, hashPasswordResetToken(reset.token));
  assert.ok(reset.expiresAt.getTime() > Date.now());
});

test("builds a reset URL containing the encoded token", () => {
  const url = new URL(buildPasswordResetUrl("token/with+symbols", "https://a2blift.com/reset-password"));

  assert.equal(url.origin, "https://a2blift.com");
  assert.equal(url.pathname, "/reset-password");
  assert.equal(url.searchParams.get("token"), "token/with+symbols");
});

test("requires a password between 8 and 128 characters", () => {
  assert.match(validateResetPassword("short") || "", /at least 8/);
  assert.equal(validateResetPassword("correct-horse"), null);
  assert.match(validateResetPassword("x".repeat(129)) || "", /128/);
});
