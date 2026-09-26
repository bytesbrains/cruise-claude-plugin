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
const { spawn } = require("node:child_process");

const KNOWN_PREFIXES = ["cru_live_", "cru_test_", "cru_demo_", "cru_svc_"];
const SESSION_ID_REGEX = /^[A-Za-z0-9._:-]{1,128}$/;
const DEFAULT_API_KEY_HELPER = 'printf %s "${CRUISE_API_KEY:-missing_cruise_key}"';
const LEGACY_API_KEY_HELPER = 'printf %s "$CRUISE_API_KEY"';

function migrateSettings(settings) {
  if (!settings || typeof settings !== "object") {
    return false;
  }
  if (settings.apiKeyHelper === LEGACY_API_KEY_HELPER) {
    settings.apiKeyHelper = DEFAULT_API_KEY_HELPER;
    return true;
  }
  return false;
}

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


function getClaudeConfigDir(options = {}) {
  if (options.local) {
    const baseDir = options.cwd || process.cwd();
    return path.join(baseDir, ".claude");
  }
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}

function getSettingsPath(options = {}) {
  if (options.settingsPath) {
    return options.settingsPath;
  }
  if (options.local) {
    return path.join(getClaudeConfigDir(options), "settings.json");
  }
  return process.env.CLAUDE_SETTINGS_PATH || path.join(getClaudeConfigDir(options), "settings.json");
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

function getCruiseEnv(options = {}) {
  const apiKey = process.env.CRUISE_API_KEY;
  const envBaseUrl = process.env.CRUISE_BASE_URL || options.baseUrl;

  const keyCheck = validateKey(apiKey, envBaseUrl);
  if (!keyCheck.valid) {
    return { valid: false, error: keyCheck.error };
  }

  const requestedSessionId =
    options.sessionId !== undefined ? options.sessionId : process.env.CRUISE_SESSION_ID;
  if (requestedSessionId !== undefined) {
    const sessionCheck = validateSessionId(requestedSessionId);
    if (!sessionCheck.valid) {
      return { valid: false, error: sessionCheck.error };
    }
  }

  const baseUrl = detectBaseUrl(apiKey, envBaseUrl);

  const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || options.model || "bb/agentic-coding",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || "bb/chat-assistant",
    CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
    CLAUDE_CODE_AUTO_MODE_SERVER: "0",
    ANTHROPIC_CUSTOM_HEADERS: mergeCustomHeaders(
      process.env.ANTHROPIC_CUSTOM_HEADERS,
      requestedSessionId
    ),
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_API_KEY: apiKey,
  };

  return { valid: true, env, baseUrl, model: env.ANTHROPIC_MODEL };
}

function runClaude(args = [], options = {}) {
  const childArgs = [];
  let sessionId = options.sessionId;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--session-id") {
      if (i + 1 < args.length) {
        sessionId = args[++i];
      }
    } else if (arg.startsWith("--session-id=")) {
      sessionId = arg.slice("--session-id=".length);
    } else {
      childArgs.push(arg);
    }
  }

  const cruiseResult = getCruiseEnv({ sessionId, baseUrl: options.baseUrl, model: options.model });
  if (!cruiseResult.valid) {
    console.error(`Error: ${cruiseResult.error}`);
    console.error('Export your key first (e.g. export CRUISE_API_KEY="cru_...") and rerun this command.');
    return Promise.resolve(1);
  }

  const claudeBin = options.claudeBin || process.env.CLAUDE_BIN || (process.platform === "win32" ? "claude.cmd" : "claude");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (!settled) {
        settled = true;
        resolve(code);
      }
    };

    let child;
    try {
      child = spawn(claudeBin, childArgs, {
        stdio: options.stdio || "inherit",
        env: cruiseResult.env,
        shell: process.platform === "win32",
      });
    } catch (err) {
      console.error(`Error spawning Claude Code: ${err.message}`);
      return finish(1);
    }

    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        console.error(`Error: Claude Code CLI ('${claudeBin}') not found in PATH.`);
        console.error("Install Claude Code first: npm install -g @anthropic-ai/claude-code");
      } else {
        console.error(`Error spawning Claude Code: ${err.message}`);
      }
      finish(1);
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        try {
          process.kill(process.pid, signal);
        } catch {
          finish(1);
        }
      } else {
        finish(code ?? 0);
      }
    });
  });
}

function enable(options = {}) {
  const isLocal = Boolean(options.local);
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
  const claudeDir = getClaudeConfigDir(options);
  const settingsPath = getSettingsPath(options);

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
  settings.env.CLAUDE_CODE_AUTO_MODE_SERVER = "0";
  settings.env.ANTHROPIC_CUSTOM_HEADERS = mergeCustomHeaders(
    settings.env.ANTHROPIC_CUSTOM_HEADERS,
    requestedSessionId
  );

  settings.apiKeyHelper = DEFAULT_API_KEY_HELPER;

  const isDefaultClaudeDir = !isLocal && claudeDir === path.join(os.homedir(), ".claude");
  const statusLineCommand = isLocal
    ? "./.claude/cruise-statusline.sh"
    : isDefaultClaudeDir
    ? "~/.claude/cruise-statusline.sh"
    : path.join(claudeDir, "cruise-statusline.sh");

  if (statusLineInstalled) {
    settings.statusLine = {
      type: "command",
      command: statusLineCommand,
    };
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");

  const scopeMsg = isLocal ? " (project-level)" : "";
  console.log(`✓ BytesBrains Cruise gateway enabled for Claude Code${scopeMsg}.`);
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
  const restartMsg = isLocal
    ? "Restart Claude Code in this project to begin routing model requests through Cruise."
    : "Restart Claude Code to begin routing model requests through Cruise.";
  console.log(`\n${restartMsg}`);
  return true;
}

function disable(options = {}) {
  const isLocal = Boolean(options.local);
  const settingsPath = getSettingsPath(options);

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
      (settings.env.ANTHROPIC_CUSTOM_HEADERS && settings.env.ANTHROPIC_CUSTOM_HEADERS.includes("x-cruise-")) ||
      settings.env.CLAUDE_CODE_AUTO_MODE_SERVER === "0"
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
    if (settings.env.CLAUDE_CODE_AUTO_MODE_SERVER === "0") {
      delete settings.env.CLAUDE_CODE_AUTO_MODE_SERVER;
      removed.push("env.CLAUDE_CODE_AUTO_MODE_SERVER");
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

  const scopeMsg = isLocal ? " (project-level)" : "";
  console.log(`✓ BytesBrains Cruise gateway disabled for Claude Code${scopeMsg}.`);
  console.log(`  Removed:      ${removed.join(", ")}`);
  console.log(`  Config File:  ${settingsPath}`);
  const restartMsg = isLocal
    ? "Restart Claude Code in this project to return to standard Anthropic routing."
    : "Restart Claude Code to return to standard Anthropic routing.";
  console.log(`\n${restartMsg}`);
  return true;
}

function status(options = {}) {
  const isLocal = Boolean(options.local);
  const settingsPath = getSettingsPath(options);
  const scopeSuffix = isLocal ? " (project-level)" : "";

  if (!fs.existsSync(settingsPath)) {
    console.log(`Cruise LLM gateway${scopeSuffix}: Disabled (no settings file found)`);
    return;
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    console.log(`Cruise LLM gateway${scopeSuffix}: Unknown (settings file could not be parsed)`);
    return;
  }

  const isConfigured = Boolean(
    (settings.env?.ANTHROPIC_BASE_URL && (settings.env.ANTHROPIC_BASE_URL.includes("bytesbrains") || settings.env.ANTHROPIC_BASE_URL.includes("cruise"))) ||
    (settings.apiKeyHelper && settings.apiKeyHelper.includes("CRUISE_API_KEY")) ||
    (settings.env?.ANTHROPIC_CUSTOM_HEADERS && settings.env.ANTHROPIC_CUSTOM_HEADERS.includes("x-cruise-"))
  );

  if (!isConfigured) {
    console.log(`Cruise LLM gateway${scopeSuffix}: Disabled (standard Anthropic routing)`);
    return;
  }

  const migrated = migrateSettings(settings);
  if (migrated) {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
    } catch {
      // ignore write error
    }
  }

  console.log(`Cruise LLM gateway${scopeSuffix}: Enabled`);
  console.log(`  Base URL:     ${settings.env?.ANTHROPIC_BASE_URL || "(not set)"}`);
  console.log(`  Model:        ${settings.env?.ANTHROPIC_MODEL || "(default)"}`);
  console.log(`  Haiku Model:  ${settings.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL || "(default)"}`);
  if (settings.env?.ANTHROPIC_CUSTOM_HEADERS) {
    const formattedHeaders = settings.env.ANTHROPIC_CUSTOM_HEADERS.replace(/\n/g, ", ");
    console.log(`  Headers:      ${formattedHeaders}`);
  }
  console.log(`  Status Line:  ${settings.statusLine?.command || "(not set)"}`);
  console.log(`  Config File:  ${settingsPath}`);
  if (migrated) {
    console.log("  Notice:       Upgraded legacy apiKeyHelper to include fallback token.");
  }
}

async function switchModel(targetModel, options = {}) {
  const isLocal = Boolean(options.local);
  if (!targetModel || typeof targetModel !== "string" || !targetModel.trim()) {
    console.error("Error: Model or lane ID is required.");
    console.error("Usage: npx @bytesbrains/claude-code-cruise switch <model-or-lane> [--local]");
    console.error("Examples:");
    console.error("  npx @bytesbrains/claude-code-cruise switch bb/agentic-coding");
    console.error("  npx @bytesbrains/claude-code-cruise switch google-ai-studio/gemini-3.8-flash --local");
    return false;
  }

  const modelId = targetModel.trim();
  const settingsPath = getSettingsPath(options);
  const claudeDir = getClaudeConfigDir(options);

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      console.error(`Error: Could not parse settings file at ${settingsPath}`);
      return false;
    }
  } else {
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
  }

  if (!settings.env || typeof settings.env !== "object" || Array.isArray(settings.env)) {
    settings.env = {};
  }

  migrateSettings(settings);

  const apiKey = process.env.CRUISE_API_KEY;
  const baseUrl = detectBaseUrl(apiKey, process.env.CRUISE_BASE_URL || settings.env.ANTHROPIC_BASE_URL);

  if (apiKey && !options.skipCheck && typeof fetch === "function") {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const found = Array.isArray(data?.data) ? data.data.find((m) => m.id === modelId) : null;
        if (found) {
          const hasTools = found["x-cruise"]?.tools;
          if (hasTools === false) {
            console.warn(`\n⚠️  Warning: Model "${modelId}" has tools: false in Cruise.`);
            console.warn("   Claude Code requires tool calling to read/write files and execute bash commands.");
            console.warn("   You may experience degraded or non-functional tool actions with this model.");
            console.warn("   Recommended agentic models: bb/agentic-coding, google-ai-studio/gemini-3.8-flash, anthropic/claude-sonnet-5.\n");
          }
        } else {
          console.warn(`\n⚠️  Notice: Model "${modelId}" was not found in the Cruise catalogue for this key.`);
          console.warn("   Updating settings anyway. Ensure the model ID is correct.\n");
        }
      }
    } catch {
      // Network timeout or offline - proceed without catalogue check
    }
  }

  const previousModel = settings.env.ANTHROPIC_MODEL;
  settings.env.ANTHROPIC_MODEL = modelId;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");

  const scopeMsg = isLocal ? " (project-level)" : "";
  console.log(`✓ Active model switched to "${modelId}"${scopeMsg}.`);
  if (previousModel && previousModel !== modelId) {
    console.log(`  Previous model: ${previousModel}`);
  }
  console.log(`  Config file:    ${settingsPath}`);
  console.log("Remember to restart Claude Code for changes to take effect.");

  if (!settings.env.ANTHROPIC_BASE_URL) {
    console.log("\nℹ Notice: Cruise gateway is not enabled yet in settings.json.");
    const enableCmd = isLocal
      ? '  Run "npx @bytesbrains/claude-code-cruise enable --local" to route requests through Cruise.'
      : '  Run "npx @bytesbrains/claude-code-cruise enable" to route requests through Cruise.';
    console.log(enableCmd);
  }

  return true;
}

function printHelp() {
  console.log(`BytesBrains Cruise for Claude Code — CLI Bootstrapper

When Claude Code cannot start due to an expired subscription, quota exhaustion,
or auth helper failure when CRUISE_API_KEY is unset, this zero-dependency
CLI configures Cruise LLM gateway routing offline.

Usage:
  npx @bytesbrains/claude-code-cruise <command> [options]
  claude-cruise [args...]

Commands:
  run [args...]          Launch Claude Code child process with Cruise gateway environment
  enable                 Route Claude Code through Cruise LLM gateway and set up status line
  disable                Safely remove Cruise gateway configuration from settings.json
  status                 Inspect current Claude Code Cruise gateway configuration
  switch <model-or-lane> Switch active model or lane in settings.json

Options:
  -l, --local            Apply configuration to local project (./.claude/settings.json)
  -s, --session-id <id>  Set custom session affinity ID (1–128 chars: letters, digits, ._:-)
  --skip-check           Skip model catalogue verification when switching models
  -h, --help             Show this help message
  -v, --version          Show version number`);
}

async function run(args = process.argv.slice(2)) {
  const invokedAs = path.basename(process.argv[1] || "", path.extname(process.argv[1] || ""));
  const isClaudeCruiseAlias = invokedAs === "claude-cruise";

  const command = args[0];

  if (isClaudeCruiseAlias && command !== "enable" && command !== "disable" && command !== "status" && command !== "switch") {
    const childArgs = command === "run" ? args.slice(1) : args;
    return await runClaude(childArgs);
  }

  if (!command || command === "-h" || command === "--help" || command === "help") {
    printHelp();
    return 0;
  }

  if (command === "-v" || command === "--version" || command === "version") {
    console.log(getPackageVersion());
    return 0;
  }

  if (command === "run") {
    return await runClaude(args.slice(1));
  }

  if (command === "enable") {
    let sessionId;
    let local = false;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--local" || arg === "-l") {
        local = true;
      } else if (arg === "--session-id" || arg === "-s") {
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
    const success = enable({ sessionId, local });
    return success ? 0 : 1;
  }

  if (command === "disable") {
    let local = false;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--local" || arg === "-l") {
        local = true;
      }
    }
    const success = disable({ local });
    return success ? 0 : 1;
  }

  if (command === "status") {
    let local = false;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--local" || arg === "-l") {
        local = true;
      }
    }
    status({ local });
    return 0;
  }

  if (command === "switch") {
    let targetModel;
    let skipCheck = false;
    let local = false;
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--local" || arg === "-l") {
        local = true;
      } else if (arg === "--skip-check") {
        skipCheck = true;
      } else if (!targetModel && !arg.startsWith("-")) {
        targetModel = arg;
      }
    }
    const success = await switchModel(targetModel, { skipCheck, local });
    return success ? 0 : 1;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Run "npx @bytesbrains/claude-code-cruise --help" for available commands.');
  return 1;
}

if (require.main === module) {
  Promise.resolve(run()).then((exitCode) => {
    process.exit(typeof exitCode === "number" ? exitCode : 0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  run,
  enable,
  disable,
  status,
  switchModel,
  runClaude,
  getCruiseEnv,
  migrateSettings,
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
  DEFAULT_API_KEY_HELPER,
  LEGACY_API_KEY_HELPER,
};
