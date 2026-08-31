import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildReferralShareUrl,
  setReferralAppTarget,
} from "../lib/referral-links";

test("driver shares always target the driver app", () => {
  assert.equal(
    buildReferralShareUrl({
      baseUrl: "https://a2blift.com",
      referralCode: "abc123",
      shareUrl: "https://api.a2blift.com/r/ABC123?app=client",
      appTarget: "driver",
    }),
    "https://a2blift.com/r/ABC123?app=driver",
  );
});

test("client shares always target the client app", () => {
  assert.equal(
    setReferralAppTarget("https://a2blift.com/r/ABC123?app=driver", "client"),
    "https://a2blift.com/r/ABC123?app=client",
  );
});

test("referral launcher attempts the selected app scheme on Android and iOS", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "website/referral-launch.html"),
    "utf8",
  );
  assert.match(source, /if \(isAndroid \|\| isIOS\)/);
  assert.match(source, /window\.setTimeout\(openApp, 120\)/);
  assert.match(source, /client:[\s\S]*?scheme: "a2bliftclient"/);
  assert.match(source, /driver:[\s\S]*?scheme: "a2blift"/);
});
