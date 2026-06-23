import assert from "node:assert/strict";
import test from "node:test";

import packageJson from "../package.json";

test("ships a native QR renderer for iOS and Android", () => {
  assert.ok(
    packageJson.dependencies["react-native-qrcode-svg"],
    "react-native-qrcode-svg must be installed for reward QR codes",
  );
});
