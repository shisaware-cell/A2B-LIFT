import assert from "node:assert/strict";
import test from "node:test";

import { getReleaseFingerprint } from "./release-info";

test("uses Railway's deployed commit SHA when it is available", () => {
  assert.equal(getReleaseFingerprint({ RAILWAY_GIT_COMMIT_SHA: "abc123def" }), "abc123def");
});

test("returns local when no deployment commit is available", () => {
  assert.equal(getReleaseFingerprint({}), "local");
});
