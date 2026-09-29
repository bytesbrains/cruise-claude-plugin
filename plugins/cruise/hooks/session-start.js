#!/usr/bin/env node
// Warn at session start about a model native routing will reject (#42).
//
// A Cruise lane or a pinned provider model (`provider/model`) left in
// ANTHROPIC_MODEL after Cruise routing is gone makes Anthropic refuse every
// request, and slash commands are requests, so nothing inside Claude Code can
// explain it. A hook needs no model: this one checks the session's env, which
// Claude Code has already merged from its settings files and the shell, and
// names where each stale value is set and how to clear it.
"use strict";

function handle(input, env = process.env) {
  const { findStaleModels, formatStaleModels } = require("../bin/cli.js");
  const cwd = (input && input.cwd) || env.CLAUDE_PROJECT_DIR || process.cwd();
  const lines = formatStaleModels(findStaleModels({ cwd, env }));
  if (lines.length === 0) return null;
  return { systemMessage: `Cruise: ${lines.join("\n")}` };
}

function main() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let input = {};
    try {
      input = JSON.parse(raw);
    } catch {
      // No input still leaves the env and the working directory to check.
    }
    try {
      const result = handle(input);
      if (result) process.stdout.write(JSON.stringify(result));
    } catch {
      // A warning is not worth failing session start over.
    }
  });
}

if (require.main === module) {
  main();
}

module.exports = { handle };
