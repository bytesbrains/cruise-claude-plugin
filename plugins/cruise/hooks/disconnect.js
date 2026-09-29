#!/usr/bin/env node
// /cruise:disconnect, run before the prompt reaches a model (#45).
//
// A slash command is a prompt: Claude Code sends it to the active model, and
// when that model is Cruise with a missing, expired or refused key, the turn
// retries a 401 ten times and the command never runs. The one command that
// gets a user out of Cruise must not depend on Cruise, so this UserPromptSubmit
// hook spots it, runs the CLI's offline `disable` on the settings file, and
// blocks the prompt with the report: no model, no network, no CRUISE_API_KEY.
//
// Every other prompt passes untouched, and fast: the CLI is only loaded for a
// match. If hooks are off, commands/disconnect.md still does the same by hand.
"use strict";

const COMMAND = /^\s*\/cruise:disconnect(?:\s+([\s\S]*))?$/;
const RECOVERY = "npx @bytesbrains/claude-code-cruise@latest disable";

function parse(prompt) {
  const match = typeof prompt === "string" ? COMMAND.exec(prompt) : null;
  if (!match) return null;
  const args = (match[1] || "").trim().split(/\s+/).filter(Boolean);
  return { local: args.includes("--local") || args.includes("-l") };
}

function handle(input) {
  const request = parse(input && input.prompt);
  if (!request) return null;

  const lines = [];
  let ok = false;
  try {
    const { disable } = require("../bin/cli.js");
    ok = disable({
      local: request.local,
      cwd: input.cwd || process.cwd(),
      log: (line) => lines.push(line),
      logError: (line) => lines.push(line),
    });
  } catch (err) {
    lines.push(`Error: ${err && err.message ? err.message : err}`);
  }
  if (!ok) {
    lines.push(`\nFix the error above, or run \`${RECOVERY}${request.local ? " --local" : ""}\` from a terminal.`);
  }
  // Blocking keeps the prompt from reaching the model; the reason is what the user sees.
  return { decision: "block", reason: `/cruise:disconnect ran locally, without a model.\n\n${lines.join("\n")}` };
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return;
    }
    const result = handle(input);
    if (result) process.stdout.write(JSON.stringify(result));
  });
}

if (require.main === module) {
  main();
}

module.exports = { parse, handle };
