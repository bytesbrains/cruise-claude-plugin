#!/usr/bin/env node
// /cruise:disconnect, run before the prompt reaches a model (#45).
//
// A slash command is a prompt: Claude Code sends it to the active model, and
// when that model is Cruise with a missing, expired or refused key, the turn
// retries a 401 ten times and the command never runs. The one command that
// gets a user out of Cruise must not depend on Cruise, so this hook runs the
// CLI's offline `disable` on the settings file and blocks the expansion with
// the report: no model, no network, no CRUISE_API_KEY.
//
// It is a UserPromptExpansion hook matched to this command, not a
// UserPromptSubmit hook, so Claude Code only starts it for /cruise:disconnect;
// ordinary prompts never pay for a node process. If hooks are off (or Claude
// Code predates the event), commands/disconnect.md does the same by hand.
"use strict";

const COMMAND_NAME = "cruise:disconnect";
const RECOVERY = "npx @bytesbrains/claude-code-cruise@latest disable";

// Claude Code sends `command_args` as the raw argument string; an object of
// named arguments is accepted too, in case that changes.
function parse(input) {
  if (!input || input.command_name !== COMMAND_NAME) return null;
  const raw = input.command_args;
  const text = typeof raw === "string" ? raw : raw && typeof raw === "object" ? Object.values(raw).join(" ") : "";
  const args = text.trim().split(/\s+/).filter(Boolean);
  return { local: args.includes("--local") || args.includes("-l") };
}

function handle(input) {
  const request = parse(input);
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
  // Blocking keeps the expanded prompt from reaching the model; the reason is what the user sees.
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
