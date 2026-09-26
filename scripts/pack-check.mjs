#!/usr/bin/env node
// Pack plugins/cruise the way `npm publish` would, unpack it, and hold the
// tarball to what a marketplace's npm source needs before it ships: exactly
// the plugin's files, the status line still executable, no credential, and a
// plugin Claude Code itself accepts. The release publishes this tarball, not a
// fresh pack, so what was checked is what ships.
//
//   node scripts/pack-check.mjs [--out <dir>]
//
// Prints the tarball's path last. gitleaks and the `claude` CLI are required:
// a check that could not run is a failure, not a pass.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const PLUGIN = path.join(ROOT, "plugins/cruise");
const EXPECTED = [
  ".claude-plugin/plugin.json",
  ".mcp.json",
  "LICENSE.txt",
  "NOTICE",
  "README.md",
  "commands/budget.md",
  "commands/connect.md",
  "commands/disconnect.md",
  "commands/models.md",
  "commands/spend.md",
  "commands/status.md",
  "commands/switch.md",
  "package.json",
  "scripts/statusline.sh",
  "skills/cruise/SKILL.md",
  "skills/setup/SKILL.md",
];
const CRUISE_KEY = /cru_(live|test|demo|svc)_[A-Za-z0-9]{8,}/;

const outFlag = process.argv.indexOf("--out");
const out = outFlag === -1 ? mkdtempSync(path.join(tmpdir(), "cruise-pack-")) : path.resolve(process.argv[outFlag + 1]);
// npm pack refuses a destination that does not exist yet.
mkdirSync(out, { recursive: true });

function fail(message) {
  console.error(`pack:check: ${message}`);
  process.exit(1);
}

function files(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? files(path.join(dir, entry.name), rel) : [rel];
  });
}

function run(command, args, what) {
  try {
    execFileSync(command, args, { stdio: ["ignore", "inherit", "inherit"] });
  } catch (error) {
    if (error.code === "ENOENT") fail(`${command} is not installed, so ${what} did not run`);
    fail(`${what} failed`);
  }
}

const [{ filename }] = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", out], { cwd: PLUGIN, encoding: "utf8" }));
const tarball = path.join(out, filename);
const unpacked = mkdtempSync(path.join(tmpdir(), "cruise-unpacked-"));
execFileSync("tar", ["-xzf", tarball, "-C", unpacked]);
const pkg = path.join(unpacked, "package");

const shipped = files(pkg).sort();
if (JSON.stringify(shipped) !== JSON.stringify([...EXPECTED].sort())) {
  fail(`the tarball carries\n  ${shipped.join("\n  ")}\nnot\n  ${EXPECTED.join("\n  ")}`);
}
if ((statSync(path.join(pkg, "scripts/statusline.sh")).mode & 0o111) === 0) {
  fail("scripts/statusline.sh lost its executable bit");
}
for (const file of shipped) {
  if (CRUISE_KEY.test(readFileSync(path.join(pkg, file), "utf8"))) fail(`${file} carries something shaped like a Cruise key`);
}
run("gitleaks", ["detect", "--no-git", "--source", pkg, "--redact", "--no-banner", "--config", path.join(ROOT, ".gitleaks.toml")], "the gitleaks scan");
run("claude", ["plugin", "validate", pkg], "claude plugin validate");

console.log(tarball);
