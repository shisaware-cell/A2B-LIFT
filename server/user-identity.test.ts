import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEmailIdentity,
  normalizePhoneIdentity,
  UserIdentityConflictError,
} from "./user-identity";
import { validateEmailAddress } from "../shared/email-validation";

test("normalizes email identities across both mobile apps", () => {
  assert.equal(normalizeEmailIdentity("  Rider@Example.COM "), "rider@example.com");
});

test("normalizes common South African phone formats to one identity", () => {
  assert.equal(normalizePhoneIdentity("082 123 4567"), "27821234567");
  assert.equal(normalizePhoneIdentity("+27 82 123 4567"), "27821234567");
  assert.equal(normalizePhoneIdentity("0027 82 123 4567"), "27821234567");
  assert.equal(normalizePhoneIdentity("82 123 4567"), "27821234567");
});

test("identity conflicts return clear account messages", () => {
  assert.equal(new UserIdentityConflictError("email").message, "An account with this email already exists");
  assert.equal(new UserIdentityConflictError("phone").message, "An account with this phone number already exists");
});

test("validates normal email domains and catches common TLD typing mistakes", () => {
  assert.deepEqual(validateEmailAddress(" Rider@Example.COM "), {
    valid: true,
    normalized: "rider@example.com",
  });

  const typo = validateEmailAddress("rider@example.con");
  assert.equal(typo.valid, false);
  assert.match(typo.message || "", /Did you mean rider@example\.com/);
});

test("rejects malformed email labels", () => {
  assert.equal(validateEmailAddress("rider@-example.com").valid, false);
  assert.equal(validateEmailAddress("rider@example").valid, false);
  assert.equal(validateEmailAddress("rider..name@example.com").valid, false);
});
