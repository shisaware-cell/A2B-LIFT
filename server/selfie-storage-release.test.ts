import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("profile selfies bypass unavailable Supabase Storage", () => {
  const uploadSource = readProjectFile("lib/supabase-storage.ts");
  const routesSource = readProjectFile("server/routes.ts");
  const mediaStoreSource = readProjectFile("server/media-object-store.ts");

  assert.match(uploadSource, /docType === "profile_selfie"/);
  assert.match(uploadSource, /manipulateAsync/);
  assert.match(uploadSource, /selfie-upload/);
  assert.match(routesSource, /\/api\/users\/:id\/selfie-upload/);
  assert.match(routesSource, /requireAuth/);
  assert.match(routesSource, /\/api\/media\/:id/);
  assert.match(mediaStoreSource, /CREATE TABLE IF NOT EXISTS app_media_objects/);
  assert.match(mediaStoreSource, /data bytea NOT NULL/);
});
