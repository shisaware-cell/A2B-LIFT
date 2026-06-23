import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const [variant, archivePath] = process.argv.slice(2);
const expected = {
  driver: { name: "A2B DRIVER", bundleIdentifier: "com.a2blift" },
  client: { name: "A2B LIFT", bundleIdentifier: "com.a2blift.client" },
}[variant];

if (!expected || !archivePath) {
  throw new Error("Usage: node scripts/verify-ios-archive.mjs <driver|client> <path-to-ipa>");
}

const resolvedArchivePath = path.resolve(archivePath);
if (!existsSync(resolvedArchivePath)) {
  throw new Error(`IPA not found: ${resolvedArchivePath}`);
}

const entries = execFileSync("unzip", ["-Z1", resolvedArchivePath], { encoding: "utf8" }).split("\n");
const configEntry = entries.find((entry) => entry.endsWith("EXConstants.bundle/app.config"));
if (!configEntry) {
  throw new Error("The IPA does not contain Expo's app.config. Do not upload it.");
}

const config = JSON.parse(execFileSync("unzip", ["-p", resolvedArchivePath, configEntry], { encoding: "utf8" }));
const actual = {
  name: config.name,
  bundleIdentifier: config.ios?.bundleIdentifier,
  appVariant: config.extra?.appVariant,
  releaseIdentity: config.extra?.releaseIdentity,
};
const expectedIdentity = `${variant}:${expected.bundleIdentifier}`;
if (
  actual.name !== expected.name ||
  actual.bundleIdentifier !== expected.bundleIdentifier ||
  actual.appVariant !== variant ||
  actual.releaseIdentity !== expectedIdentity
) {
  throw new Error(
    `Wrong ${variant} IPA: ${JSON.stringify(actual)}. Expected ${JSON.stringify({ ...expected, appVariant: variant, releaseIdentity: expectedIdentity })}. Do not upload it.`,
  );
}

console.log(`Verified ${variant} IPA: ${actual.name} (${actual.bundleIdentifier})`);
