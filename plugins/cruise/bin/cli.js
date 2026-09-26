#!/usr/bin/env node
// Standalone CLI bootstrapper for BytesBrains Cruise (#18).
//
// When Claude Code cannot start due to an expired subscription or quota exhaustion,
// this zero-dependency CLI configures Cruise gateway routing and status line offline
// without requiring Claude Code to start.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const KNOWN_PREFIXES = ["cru_live_", "cru_test_", "cru_demo_", "cru_svc_"];
const SESSION_ID_REGEX = /^[A-Za-z0-9._:-]{1,128}$/;

function validateSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== "string" || !SESSION_ID_REGEX.test(sessionId)) {
    return {
      valid: false,
      error: "Cruise session ID must be 1–128 characters consisting of letters, digits, and ._:-",
    };
  }
  return { valid: true };
}

function mergeCustomHeaders(existingHeaders, sessionOverride) {
  const lines = typeof existingHeaders === "string"
    ? existingHeaders.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];
  let hasClass = false;
  let hasSession = false;
  const result = [];

  for (const line of lines) {
    if (/^x-cruise-class\s*:/i.test(line)) {
      if (!hasClass) {
        result.push("x-cruise-class: agentic");
        hasClass = true;
      }
    } else if (/^x-cruise-session\s*:/i.test(line)) {
      if (!hasSession) {
        const sid =
          sessionOverride !== undefined && sessionOverride !== ""
            ? sessionOverride
            : line.replace(/^x-cruise-session\s*:\s*/i, "").trim();
        result.push(`x-cruise-session: ${sid}`);
        hasSession = true;
      }
    } else {
      result.push(line);
    }
  }

  if (!hasClass) {
    result.push("x-cruise-class: agentic");
  }
  if (!hasSession) {
    const sid =
      sessionOverride !== undefined && sessionOverride !== ""
        ? sessionOverride
        : `claude-code-${crypto.randomUUID()}`;
    result.push(`x-cruise-session: ${sid}`);
  }

  return result.join("\n");
}

function cleanCustomHeaders(existingHeaders) {
  if (typeof existingHeaders !== "string") {
    return { cleaned: undefined, removedCruiseHeaders: false };
  }
  const lines = existingHeaders.split("\n").map((l) => l.trim()).filter(Boolean);
  const remaining = [];
  let removedCruiseHeaders = false;

  for (const line of lines) {
    if (/^x-cruise-(class|session)\s*:/i.test(line)) {
      removedCruiseHeaders = true;
    } else {
      remaining.push(line);
    }
  }

  return {
    cleaned: remaining.length > 0 ? remaining.join("\n") : undefined,
    removedCruiseHeaders,
  };
}


function getClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

function getSettingsPath() {
  return process.env.CLAUDE_SETTINGS_PATH || path.join(getClaudeConfigDir(), "settings.json");
}

function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function validateKey(apiKey, baseUrl) {
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
    return { valid: false, error: "CRUISE_API_KEY is not set in your environment." };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) {
    return { valid: false, error: "CRUISE_API_KEY contains invalid characters (such as whitespace or quotes)." };
  }
  const hasKnownPrefix = KNOWN_PREFIXES.some((prefix) => apiKey.startsWith(prefix));
  if (!hasKnownPrefix && !baseUrl) {
    return {
      valid: false,
      error: `CRUISE_API_KEY does not start with a recognized Cruise prefix (${KNOWN_PREFIXES.join(", ")}). Set CRUISE_BASE_URL explicitly if using a custom endpoint.`,
    };
  }
  return { valid: true };
}

function detectBaseUrl(apiKey, explicitUrl) {
  if (explicitUrl && explicitUrl.trim() !== "") {
    return explicitUrl.trim();
  }
  if (apiKey.startsWith("cru_demo_")) {
    return "https://cruise-demo.bytesbrains.net";
  }
  if (apiKey.startsWith("cru_test_")) {
    return "https://cruise-staging.bytesbrains-cruise.workers.dev";
  }
  return "https://cruise.bytesbrains.net";
}

function installStatusLine(claudeDir) {
  const destScript = path.join(claudeDir, "cruise-statusline.sh");
  const srcScript = path.resolve(__dirname, "../scripts/statusline.sh");

  if (fs.existsSync(srcScript)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.copyFileSync(srcScript, destScript);
    try {
      fs.chmodSync(destScript, 0o755);
    } catch {
      // ignore chmod error
    }
    return true;
  }

  if (fs.existsSync(destScript)) {
    try {
      fs.chmodSync(destScript, 0o755);
    } catch {
      // ignore chmod error
    }
    return true;
  }

  return false;
}

function enable(options = {}) {
  const apiKey = process.env.CRUISE_API_KEY;
  const envBaseUrl = process.env.CRUISE_BASE_URL || options.baseUrl;

  const keyCheck = validateKey(apiKey, envBaseUrl);
  if (!keyCheck.valid) {
    console.error(`Error: ${keyCheck.error}`);
    console.error('Export your key first (e.g. export CRUISE_API_KEY="cru_...") and rerun this command.');
    return false;
  }

  const requestedSessionId =
    options.sessionId !== undefined ? options.sessionId : process.env.CRUISE_SESSION_ID;
  if (requestedSessionId !== undefined) {
    const sessionCheck = validateSessionId(requestedSessionId);
    if (!sessionCheck.valid) {
      console.error(`Error: ${sessionCheck.error}`);
      return false;
    }
  }

  const baseUrl = detectBaseUrl(apiKey, envBaseUrl);
  const claudeDir = getClaudeConfigDir();
  const settingsPath = getSettingsPath();

  fs.mkdirSync(claudeDir, { recursive: true });

  const statusLineInstalled = installStatusLine(claudeDir);
  if (!statusLineInstalled) {
    console.warn("Warning: Status line script not found; statusLine will not be configured.");
  }

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch (err) {
      console.error(`Error: Failed to parse ${settingsPath}: ${err.message}`);
      return false;
    }
  }

  if (!settings.env || typeof settings.env !== "object" || Array.isArray(settings.env)) {
    settings.env = {};
  }

  settings.env.ANTHROPIC_BASE_URL = baseUrl;
  if (!settings.env.ANTHROPIC_MODEL) {
    settings.env.ANTHROPIC_MODEL = "bb/agentic-coding";
  }
  settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = "bb/chat-assistant";
  settings.env.CLAUDE_CODE_ATTRIBUTION_HEADER = "0";
  settings.env.ANTHROPIC_CUSTOM_HEADERS = mergeCustomHeaders(
    settings.env.ANTHROPIC_CUSTOM_HEADERS,
    requestedSessionId
  );

  settings.apiKeyHelper = 'printf %s "$CRUISE_API_KEY"';

  const isDefaultClaudeDir = claudeDir === path.join(os.homedir(), ".claude");
  const statusLineCommand = isDefaultClaudeDir
    ? "~/.claude/cruise-statusline.sh"
    : path.join(claudeDir, "cruise-statusline.sh");

  if (statusLineInstalled) {
    settings.statusLine = {
      type: "command",
      command: statusLineCommand,
    };
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");

  console.log("✓ BytesBrains Cruise gateway enabled for Claude Code.");
  console.log(`  Base URL:     ${baseUrl}`);
  console.log(`  Model:        ${settings.env.ANTHROPIC_MODEL}`);
  console.log(`  Haiku Model:  ${settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL}`);
  if (settings.env.ANTHROPIC_CUSTOM_HEADERS) {
    const formattedHeaders = settings.env.ANTHROPIC_CUSTOM_HEADERS.replace(/\n/g, ", ");
    console.log(`  Headers:      ${formattedHeaders}`);
  }
  if (statusLineInstalled) {
    console.log(`  Status Line:  ${statusLineCommand}`);
  }
  console.log(`  Config File:  ${settingsPath}`);
  console.log("\nRestart Claude Code to begin routing model requests through Cruise.");
  return true;
}

function disable() {
  const settingsPath = getSettingsPath();

  if (!fs.existsSync(settingsPath)) {
    console.log("Cruise routing is not active (settings file does not exist).");
    return true;
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (err) {
    console.error(`Error: Failed to parse ${settingsPath}: ${err.message}`);
    return false;
  }

  let modified = false;
  const removed = [];

  const isCruiseConfigured = Boolean(
    (settings.apiKeyHelper && settings.apiKeyHelper.includes("CRUISE_API_KEY")) ||
    (settings.statusLine && typeof settings.statusLine.command === "string" && settings.statusLine.command.includes("cruise-statusline.sh")) ||
    (settings.env && (
      (settings.env.ANTHROPIC_BASE_URL && (settings.env.ANTHROPIC_BASE_URL.includes("bytesbrains") || settings.env.ANTHROPIC_BASE_URL.includes("cruise"))) ||
      settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL === "bb/chat-assistant" ||
      (settings.env.ANTHROPIC_MODEL && (settings.env.ANTHROPIC_MODEL.startsWith("bb/") || settings.env.ANTHROPIC_MODEL.includes("cruise"))) ||
      (settings.env.ANTHROPIC_CUSTOM_HEADERS && settings.env.ANTHROPIC_CUSTOM_HEADERS.includes("x-cruise-"))
    ))
  );

  if (settings.env && typeof settings.env === "object" && !Array.isArray(settings.env)) {
    if (
      settings.env.ANTHROPIC_BASE_URL &&
      (isCruiseConfigured ||
        settings.env.ANTHROPIC_BASE_URL.includes("bytesbrains") ||
        settings.env.ANTHROPIC_BASE_URL.includes("cruise") ||
        (process.env.CRUISE_BASE_URL && settings.env.ANTHROPIC_BASE_URL === process.env.CRUISE_BASE_URL))
    ) {
      delete settings.env.ANTHROPIC_BASE_URL;
      removed.push("env.ANTHROPIC_BASE_URL");
      modified = true;
    }
    if (
      settings.env.ANTHROPIC_MODEL &&
      (settings.env.ANTHROPIC_MODEL.startsWith("bb/") || settings.env.ANTHROPIC_MODEL.includes("cruise"))
    ) {
      delete settings.env.ANTHROPIC_MODEL;
      removed.push("env.ANTHROPIC_MODEL");
      modified = true;
    }
    if (
      settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL &&
      settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL.startsWith("bb/")
    ) {
      delete settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
      removed.push("env.ANTHROPIC_DEFAULT_HAIKU_MODEL");
      modified = true;
    }
    if (settings.env.CLAUDE_CODE_ATTRIBUTION_HEADER === "0") {
      delete settings.env.CLAUDE_CODE_ATTRIBUTION_HEADER;
      removed.push("env.CLAUDE_CODE_ATTRIBUTION_HEADER");
      modified = true;
    }
    if (settings.env.ANTHROPIC_CUSTOM_HEADERS) {
      const { cleaned, removedCruiseHeaders } = cleanCustomHeaders(settings.env.ANTHROPIC_CUSTOM_HEADERS);
      if (removedCruiseHeaders) {
        if (cleaned) {
          settings.env.ANTHROPIC_CUSTOM_HEADERS = cleaned;
          removed.push("env.ANTHROPIC_CUSTOM_HEADERS (Cruise headers removed)");
        } else {
          delete settings.env.ANTHROPIC_CUSTOM_HEADERS;
          removed.push("env.ANTHROPIC_CUSTOM_HEADERS");
        }
        modified = true;
      }
    }
    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }
  }

  if (settings.apiKeyHelper && settings.apiKeyHelper.includes("CRUISE_API_KEY")) {
    delete settings.apiKeyHelper;
    removed.push("apiKeyHelper");
    modified = true;
  }

  if (
    settings.statusLine &&
    typeof settings.statusLine.command === "string" &&
    settings.statusLine.command.includes("cruise-statusline.sh")
  ) {
    delete settings.statusLine;
    removed.push("statusLine");
    modified = true;
  }

  if (!modified) {
    console.log(`Cruise routing is not active in ${settingsPath}.`);
    return true;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");

  console.log("✓ BytesBrains Cruise gateway disabled for Claude Code.");
  console.log(`  Removed:      ${removed.join(", ")}`);
  console.log(`  Config File:  ${settingsPath}`);
  console.log("\nRestart Claude Code to return to standard Anthropic routing.");
  return true;
}

function status() {
  const settingsPath = getSettingsPath();

  if (!fs.existsSync(settingsPath)) {
    console.log("Cruise LLM gateway: Disabled (no settings file found)");
    return;
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    console.log("Cruise LLM gateway: Unknown (settings file could not be parsed)");
    return;
  }

  const isConfigured = Boolean(
    (settings.env?.ANTHROPIC_BASE_URL && (settings.env.ANTHROPIC_BASE_URL.includes("bytesbrains") || settings.env.ANTHROPIC_BASE_URL.includes("cruise"))) ||
    (settings.apiKeyHelper && settings.apiKeyHelper.includes("CRUISE_API_KEY")) ||
    (settings.env?.ANTHROPIC_CUSTOM_HEADERS && settings.env.ANTHROPIC_CUSTOM_HEADERS.includes("x-cruise-"))
  );

  if (!isConfigured) {
    console.log("Cruise LLM gateway: Disabled (standard Anthropic routing)");
    return;
  }

  console.log("Cruise LLM gateway: Enabled");
  console.log(`  Base URL:     ${settings.env?.ANTHROPIC_BASE_URL || "(not set)"}`);
  console.log(`  Model:        ${settings.env?.ANTHROPIC_MODEL || "(default)"}`);
  console.log(`  Haiku Model:  ${settings.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL || "(default)"}`);
  if (settings.env?.ANTHROPIC_CUSTOM_HEADERS) {
    const formattedHeaders = settings.env.ANTHROPIC_CUSTOM_HEADERS.replace(/\n/g, ", ");
    console.log(`  Headers:      ${formattedHeaders}`);
  }
  console.log(`  Status Line:  ${settings.statusLine?.command || "(not set)"}`);
  console.log(`  Config File:  ${settingsPath}`);
}

function printHelp() {
  console.log(`BytesBrains Cruise for Claude Code — CLI Bootstrapper

When Claude Code cannot start due to an expired subscription or quota exhaustion,
this zero-dependency CLI configures Cruise LLM gateway routing offline.

Usage:
  npx @bytesbrains/claude-code-cruise <command> [options]

Commands:
  enable     Route Claude Code through Cruise LLM gateway and set up status line
  disable    Safely remove Cruise gateway configuration from settings.json
  status     Inspect current Claude Code Cruise gateway configuration

Options:
  -s, --session-id <id>  Set custom session affinity ID (1–128 chars: letters, digits, ._:-)
  -h, --help             Show this help message
  -v, --version          Show version number`);
}

function run(args = process.argv.slice(2)) {
  const command = args[0];

  if (!command || command === "-h" || command === "--help" || command === "help") {
    printHelp();
    return 0;
  }

  if (command === "-v" || command === "--version" || command === "version") {
    console.log(getPackageVersion());
    return 0;
  }

  if (command === "enable") {
    let sessionId;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--session-id" || arg === "-s") {
        if (i + 1 >= args.length) {
          console.error("Error: Option '--session-id' requires an argument.");
          return 1;
        }
        sessionId = args[++i];
      } else if (arg.startsWith("--session-id=")) {
        sessionId = arg.slice("--session-id=".length);
      } else if (arg.startsWith("-s=")) {
        sessionId = arg.slice("-s=".length);
      }
    }
    const success = enable({ sessionId });
    return success ? 0 : 1;
  }

  if (command === "disable") {
    const success = disable();
    return success ? 0 : 1;
  }

  if (command === "status") {
    status();
    return 0;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Run "npx @bytesbrains/claude-code-cruise --help" for available commands.');
  return 1;
}

if (require.main === module) {
  const exitCode = run();
  process.exit(exitCode);
}

module.exports = {
  run,
  enable,
  disable,
  status,
  validateKey,
  validateSessionId,
  mergeCustomHeaders,
  cleanCustomHeaders,
  detectBaseUrl,
  installStatusLine,
  getClaudeConfigDir,
  getSettingsPath,
  KNOWN_PREFIXES,
  SESSION_ID_REGEX,
};
