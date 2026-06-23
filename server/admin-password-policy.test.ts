import assert from "node:assert/strict";
import test from "node:test";

import { validateAdminPassword } from "./admin-password-policy";

test("accepts an administrator password with eight or more characters", () => {
  assert.deepEqual(validateAdminPassword("A2bLift!2026"), { ok: true });
});

test("rejects a short administrator password", () => {
  assert.deepEqual(validateAdminPassword("short"), {
    ok: false,
    message: "Password must be at least 8 characters.",
  });
});
