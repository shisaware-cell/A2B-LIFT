import assert from "node:assert/strict";
import test from "node:test";

import { resolveAppVariant } from "../packages/mobile-core/src/app-variant-resolver";

test("uses the public build variant before Expo's embedded config", () => {
  assert.equal(resolveAppVariant("client", "driver"), "client");
});

test("uses the embedded Expo config when no public build variant is present", () => {
  assert.equal(resolveAppVariant(undefined, "driver"), "driver");
  assert.equal(resolveAppVariant(undefined, "client"), "client");
});

test("uses mixed only when neither source identifies the app", () => {
  assert.equal(resolveAppVariant(undefined, undefined), "mixed");
});
