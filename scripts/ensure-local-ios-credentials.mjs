#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const variant = String(process.argv[2] || "").trim().toLowerCase();
if (!["driver", "client"].includes(variant)) {
  console.error("Usage: node scripts/ensure-local-ios-credentials.mjs <driver|client>");
  process.exit(1);
}

const root = process.cwd();
const home = process.env.HOME || "";
const credentialsPath = path.join(root, "credentials.json");
const iosDir = path.join(root, "credentials", "ios");

const defaults = {
  driver: {
    p12: path.join(home, "Desktop", "a2b-driver.p12"),
    profileCandidates: [
      path.join(home, "Desktop", "a2bdriver.mobileprovision"),
      path.join(home, "Desktop", "a2b-driver.mobileprovision"),
    ],
    profileOut: path.join(iosDir, "a2b-driver.mobileprovision"),
    p12Out: path.join(iosDir, "a2b-driver.p12"),
  },
  client: {
    p12: path.join(home, "Desktop", "a2b-driver.p12"),
    profileCandidates: [
      path.join(home, "Desktop", "a2b-client.mobileprovision"),
    ],
    profileOut: path.join(iosDir, "a2b-client.mobileprovision"),
    p12Out: path.join(iosDir, "a2b-driver.p12"),
  },
};

function readCredentials() {
  if (!fs.existsSync(credentialsPath)) return {};
  return JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
}

function firstExisting(paths) {
  return paths.find((candidate) => fs.existsSync(candidate));
}

function promptHidden(query) {
  if (!process.stdin.isTTY) {
    throw new Error("P12 password is required. Set P12_PASSWORD and rerun.");
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      char = String(char);
      switch (char) {
        case "\n":
        case "\r":
        case "\u0004":
          process.stdout.write("\n");
          process.stdin.off("data", onData);
          break;
        default:
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(query + "*".repeat(rl.line.length));
          break;
      }
    };
    process.stdin.on("data", onData);
    rl.question(query, (value) => {
      rl.close();
      resolve(value);
    });
  });
}

const selected = defaults[variant];
const p12Path = process.env.A2B_IOS_P12_PATH || selected.p12;
const profilePath =
  process.env.A2B_IOS_PROFILE_PATH ||
  firstExisting(selected.profileCandidates);

if (!fs.existsSync(p12Path)) {
  throw new Error(`Missing iOS distribution certificate: ${p12Path}`);
}
if (!profilePath) {
  throw new Error(`Missing ${variant} provisioning profile on Desktop.`);
}

const existing = readCredentials();
let password =
  process.env.P12_PASSWORD ||
  process.env.A2B_P12_PASSWORD ||
  existing?.ios?.distributionCertificate?.password ||
  "";

if (!password) {
  password = await promptHidden("Paste the p12 password: ");
}
if (!password) {
  throw new Error("P12 password is empty.");
}

fs.mkdirSync(iosDir, { recursive: true });
fs.copyFileSync(p12Path, selected.p12Out);
fs.copyFileSync(profilePath, selected.profileOut);

existing.ios = {
  provisioningProfilePath: path.relative(root, selected.profileOut),
  distributionCertificate: {
    path: path.relative(root, selected.p12Out),
    password,
  },
};

fs.writeFileSync(credentialsPath, JSON.stringify(existing, null, 2) + "\n");

console.log(`iOS credentials configured for ${variant}.`);
console.log(`Profile: ${existing.ios.provisioningProfilePath}`);
console.log(`Certificate: ${existing.ios.distributionCertificate.path}`);
