// The Claude Code plugin (#388): what gets published, held before it is.
//
// The plugin is JSON, Markdown and a shell script, so what is worth testing is
// the contract each file makes — the manifest and marketplace agree, the MCP
// config reads the key from the environment and never carries one, every skill
// says when it applies, and the status line prints what it should from the
// answer Cruise actually gives.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(import.meta.dirname, "..");
const PLUGIN = path.join(ROOT, "plugins/cruise");
const json = (file: string) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8")) as Record<string, any>;

/** Every file a marketplace clone carries: this whole repo, less git's store and installed deps. */
function published(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return [".git", "node_modules"].includes(entry.name) ? [] : published(full);
    return [full];
  });
}

describe("the manifest and the marketplace", () => {
  it("name one plugin, found where the marketplace says", () => {
    const manifest = json("plugins/cruise/.claude-plugin/plugin.json");
    const marketplace = json(".claude-plugin/marketplace.json");

    expect(manifest.name).toBe("cruise");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]).toMatchObject({ name: "cruise", source: "./plugins/cruise" });
    // One version, in plugin.json: set in both, Claude Code silently takes the
    // manifest's, and the two drift.
    expect(marketplace.plugins[0]).not.toHaveProperty("version");
    // Both package.json files carry one too, for npm; they follow the manifest.
    expect(json("package.json").version).toBe(manifest.version);
    expect(json("plugins/cruise/package.json").version).toBe(manifest.version);
  });
});

describe("the npm package", () => {
  // A marketplace's npm source unpacks the package as the plugin root, so the
  // package is plugins/cruise. The repo root is tooling and must never publish.
  it("is plugins/cruise, public under @bytesbrains, and the root is not a package", () => {
    const pkg = json("plugins/cruise/package.json");
    expect(pkg).toMatchObject({
      name: "@bytesbrains/claude-code-cruise",
      license: "Apache-2.0",
      bin: {
        "claude-code-cruise": "bin/cli.js",
        cruise: "bin/cli.js",
      },
      repository: { url: "git+https://github.com/bytesbrains/cruise-claude-plugin.git", directory: "plugins/cruise" },
      publishConfig: { access: "public", provenance: true },
    });
    expect(pkg).not.toHaveProperty("private");
    expect(pkg).not.toHaveProperty("scripts");
    expect(json("package.json").private).toBe(true);
  });
});

describe("the README", () => {
  // A moved or renamed icon shows as a broken image on the repo's front page.
  it("points only at images this repo has", () => {
    const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");
    const local = [...readme.matchAll(/<img src="([^"]+)"/g)].map((match) => match[1]!).filter((src) => !/^https?:/.test(src));
    expect(local).toContain("assets/cruise-logo.svg");
    for (const src of local) expect(existsSync(path.join(ROOT, src)), src).toBe(true);
  });
});

describe("the MCP server config", () => {
  it("reads the key and the base URL from the environment", () => {
    const server = json("plugins/cruise/.mcp.json").mcpServers.cruise;
    expect(server).toEqual({
      type: "http",
      url: "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/mcp",
      headers: { Authorization: "Bearer ${CRUISE_API_KEY}" },
    });
  });

  // A published artifact holding a key is a leaked key.
  it("carries no Cruise credential in any published file", () => {
    for (const file of published()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/cru_(live|test|demo|svc)_[A-Za-z0-9]{8,}/);
    }
  });
});

describe("the skills", () => {
  it("each say when they apply, and setup runs only when asked", () => {
    const skills = readdirSync(path.join(PLUGIN, "skills"));
    expect(skills.sort()).toEqual(["cruise", "setup"]);
    for (const skill of skills) {
      const text = readFileSync(path.join(PLUGIN, "skills", skill, "SKILL.md"), "utf8");
      const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
      expect(front, skill).toMatch(new RegExp(`^name: ${skill}$`, "m"));
      expect(front, skill).toMatch(/^description: .{40,}$/m);
    }
    // Setup edits the user's settings; the model must not decide to run it.
    expect(readFileSync(path.join(PLUGIN, "skills/setup/SKILL.md"), "utf8")).toMatch(/^disable-model-invocation: true$/m);
  });
});

describe("the commands", () => {
  it("each provide a valid frontmatter description", () => {
    const commands = readdirSync(path.join(PLUGIN, "commands"));
    expect(commands.sort()).toEqual(["budget.md", "connect.md", "disconnect.md", "models.md", "spend.md", "status.md", "switch.md"]);
    for (const cmd of commands) {
      const text = readFileSync(path.join(PLUGIN, "commands", cmd), "utf8");
      const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
      expect(front, cmd).toMatch(/^description: .{20,}$/m);
    }
    // Commands that edit settings must not be invoked by the model.
    for (const cmd of ["connect.md", "disconnect.md", "switch.md"]) {
      expect(readFileSync(path.join(PLUGIN, "commands", cmd), "utf8")).toMatch(/^disable-model-invocation: true$/m);
    }
  });

  it("status, budget, and spend inspect gateway state and ledger", () => {
    for (const cmd of ["status.md", "budget.md"]) {
      const doc = readFileSync(path.join(PLUGIN, "commands", cmd), "utf8");
      expect(doc).toMatch(/get_budget/);
      expect(doc).toMatch(/spend_usd/);
      expect(doc).toMatch(/hard_usd/);
      expect(doc).toMatch(/balance_usd/);
      expect(doc).toMatch(/serve/i);
      expect(doc).toMatch(/refuse/i);
      expect(doc).toMatch(/budget_exhausted/);
      expect(doc).toMatch(/wallet_exhausted/);
    }

    const spend = readFileSync(path.join(PLUGIN, "commands/spend.md"), "utf8");
    const front = /^---\n([\s\S]*?)\n---/.exec(spend)?.[1] ?? "";
    expect(front).toMatch(/^argument-hint: "\[month\]"$/m);
    expect(spend).toMatch(/get_spend/);
    expect(spend).toMatch(/"by":\s*"lane"/);
    expect(spend).toMatch(/"by":\s*"model"/);
    expect(spend).toMatch(/budget_exhausted/);
    expect(spend).toMatch(/wallet_exhausted/);
  });

  it("commands do not expose credentials on command line or leak keys", () => {
    const commands = readdirSync(path.join(PLUGIN, "commands"));
    for (const cmd of commands) {
      const text = readFileSync(path.join(PLUGIN, "commands", cmd), "utf8");
      expect(text, cmd).not.toMatch(/cru_(live|test|demo|svc)_[A-Za-z0-9]{8,}/);
      // Key should not be passed directly in -H argument where it is visible in ps
      expect(text, cmd).not.toMatch(/-H\s+["']Authorization:\s*Bearer\s*\$\{?CRUISE_API_KEY/i);
    }
  });

  it("connect and disconnect handle safety guards", () => {
    const connect = readFileSync(path.join(PLUGIN, "commands/connect.md"), "utf8");
    // Prefix validation and character check
    expect(connect).toMatch(/cru_live_\*\|cru_test_\*\|cru_demo_\*\|cru_svc_\*/);
    expect(connect).toMatch(/UNKNOWN_PREFIX/);
    expect(connect).toMatch(/INVALID_CHARS/);
    // Endpoint detection
    expect(connect).toMatch(/https:\/\/cruise-demo\.bytesbrains\.net/);
    expect(connect).toMatch(/https:\/\/cruise-staging\.bytesbrains-cruise\.workers\.dev/);
    expect(connect).toMatch(/https:\/\/cruise\.bytesbrains\.net/);
    // Statusline guard: don't configure broken statusLine if script missing
    expect(connect).toMatch(/statusline_copied/);
    expect(connect).toMatch(/Do NOT configure a broken `statusLine`/i);
    // Settings merge & credentials
    expect(connect).toMatch(/Preserve all unrelated environment variables/i);
    expect(connect).toMatch(/apiKeyHelper/);
    expect(connect).toMatch(/printf %s \\"\$CRUISE_API_KEY\\"/);

    const disconnect = readFileSync(path.join(PLUGIN, "commands/disconnect.md"), "utf8");
    // Guard against running when no cruise config
    expect(disconnect).toMatch(/Halt immediately/i);
    // Surgical removal of Cruise keys while preserving user settings
    expect(disconnect).toMatch(/Preserve all other environment variables/i);
    expect(disconnect).toMatch(/\*bytesbrains\*/);
  });
});

describe("the status line script", () => {
  const script = path.join(PLUGIN, "scripts/statusline.sh");
  const run = (env: Record<string, string>) =>
    spawnSync("sh", [script], { input: "{}", encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } });

  it("is executable and parses as POSIX sh", () => {
    expect(statSync(script).mode & 0o111).not.toBe(0);
    execFileSync("sh", ["-n", script]);
  });

  it("asks for a key rather than calling anything without one", () => {
    expect(run({ TMPDIR: mkdtempSync(path.join(tmpdir(), "cruise-")) }).stdout).toBe("Cruise: set CRUISE_API_KEY\n");
  });

  // The key is written into a curl config line; a quote and a newline would
  // start an option of its choosing (#396 review). Refused before any request:
  // the base URL here points at a port nothing listens on, and the line says so
  // only if curl ran.
  it("refuses a key that could break out of the curl config line", () => {
    const key = 'x"\noutput = "/tmp/owned';
    const out = run({ CRUISE_API_KEY: key, CRUISE_BASE_URL: "http://127.0.0.1:9", TMPDIR: mkdtempSync(path.join(tmpdir(), "cruise-")) });
    expect(out.stdout).toBe("Cruise: CRUISE_API_KEY is not a Cruise key\n");
  });

  it("prints the budget line from the answer Cruise gives, and caches it", async () => {
    let requests = 0;
    let authorization = "";
    const server = createServer((request, response) => {
      requests++;
      authorization = request.headers.authorization ?? "";
      response.setHeader("content-type", "application/json");
      // The shape `get_budget` answers, compact as Response.json writes it.
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{ type: "text", text: "Project lens. Spent $0.0044 this day of $2.0000 — serve." }],
            structuredContent: {
              project: "lens",
              budget: { period: "day", spend_usd: "0.0044", soft_usd: "1.6000", hard_usd: "2.0000", state: "ok", action: "serve" },
              wallet: { balance_usd: "82.6122", granted_usd: "85.0000", spend_usd: "2.3878", state: "ok", action: "serve" },
            },
          },
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    const env = { CRUISE_API_KEY: "test-key", CRUISE_BASE_URL: `http://127.0.0.1:${port}`, TMPDIR: mkdtempSync(path.join(tmpdir(), "cruise-")) };

    // Asynchronous, not spawnSync: a synchronous child blocks this process's
    // event loop, and the server above could never answer it.
    const statusLine = (overrides: Record<string, string> = {}) =>
      new Promise<string>((resolve, reject) => {
        const child = spawn("sh", [script], { env: { PATH: process.env.PATH ?? "", ...env, ...overrides } });
        let out = "";
        child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
        child.on("error", reject);
        child.on("close", () => resolve(out));
        child.stdin.end("{}");
      });

    const first = await statusLine();
    const second = await statusLine();
    expect(first).toBe("Cruise lens · $0.0044 of $2.0000 this day · serve\n");
    expect(authorization).toBe("Bearer test-key");
    // The second run is served from the 60-second cache: a status line runs on
    // every session event and must not become a request each time.
    expect(second).toBe(first);
    expect(requests).toBe(1);

    // Another key is another project: it must not be answered from the first
    // key's cache (#396 review).
    await statusLine({ CRUISE_API_KEY: "other-key" });
    server.close();
    expect(authorization).toBe("Bearer other-key");
    expect(requests).toBe(2);
  });
});

describe("the CLI bootstrapper", () => {
  const cli = path.join(PLUGIN, "bin/cli.js");
  const runCli = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", ...env },
    });

  it("is executable and has a valid shebang", () => {
    expect(statSync(cli).mode & 0o111).not.toBe(0);
    const content = readFileSync(cli, "utf8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("prints help on --help or without arguments", () => {
    const noArgs = runCli([]);
    expect(noArgs.status).toBe(0);
    expect(noArgs.stdout).toMatch(/Usage:\s+npx @bytesbrains\/claude-code-cruise/);
    expect(noArgs.stdout).toMatch(/enable/);
    expect(noArgs.stdout).toMatch(/disable/);

    const help = runCli(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toBe(noArgs.stdout);
  });

  it("prints version on --version", () => {
    const out = runCli(["--version"]);
    expect(out.status).toBe(0);
    expect(out.stdout.trim()).toBe(json("plugins/cruise/package.json").version);
  });

  it("enable fails when CRUISE_API_KEY is missing", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "cruise-cli-test-"));
    const out = runCli(["enable"], { CLAUDE_CONFIG_DIR: tmp, CRUISE_API_KEY: "" });
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/CRUISE_API_KEY is not set/);
  });

  const LIVE_KEY = ["cru", "live", "testkey"].join("_");
  const DEMO_KEY = ["cru", "demo", "testkey"].join("_");
  const INVALID_CHAR_KEY = ["cru", "live", "bad key!"].join("_");
  const UNRECOGNIZED_KEY = "unrecognized_prefix_key";

  it("enable fails when CRUISE_API_KEY has invalid characters", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "cruise-cli-test-"));
    const out = runCli(["enable"], { CLAUDE_CONFIG_DIR: tmp, CRUISE_API_KEY: INVALID_CHAR_KEY });
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/invalid characters/);
  });

  it("enable fails when CRUISE_API_KEY has unrecognized prefix without custom URL", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "cruise-cli-test-"));
    const out = runCli(["enable"], { CLAUDE_CONFIG_DIR: tmp, CRUISE_API_KEY: UNRECOGNIZED_KEY });
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/recognized Cruise prefix/);
  });

  it("enable configures settings and statusline for different prefixes and custom URLs", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "cruise-cli-test-"));
    const settingsPath = path.join(tmp, "settings.json");

    // Pre-populate user settings with unrelated vars
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          theme: "dark",
          env: { USER_VAR: "custom_val", ANTHROPIC_MODEL: "anthropic/claude-sonnet-4" },
        },
        null,
        2,
      ),
    );

    // Enable with demo key prefix
    const out = runCli(["enable"], { CLAUDE_CONFIG_DIR: tmp, CRUISE_API_KEY: DEMO_KEY });
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/BytesBrains Cruise gateway enabled/);
    expect(out.stdout).toMatch(/https:\/\/cruise-demo\.bytesbrains\.net/);
    expect(out.stdout).not.toMatch(new RegExp(DEMO_KEY)); // Does not leak key

    // Check status line installed and executable
    const statusline = path.join(tmp, "cruise-statusline.sh");
    expect(existsSync(statusline)).toBe(true);
    expect(statSync(statusline).mode & 0o111).not.toBe(0);

    // Verify settings deep merge
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(settings.theme).toBe("dark");
    expect(settings.env.USER_VAR).toBe("custom_val");
    // Pre-existing ANTHROPIC_MODEL preserved
    expect(settings.env.ANTHROPIC_MODEL).toBe("anthropic/claude-sonnet-4");
    expect(settings.env.ANTHROPIC_BASE_URL).toBe("https://cruise-demo.bytesbrains.net");
    expect(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("bb/chat-assistant");
    expect(settings.env.CLAUDE_CODE_ATTRIBUTION_HEADER).toBe("0");
    expect(settings.apiKeyHelper).toBe('printf %s "$CRUISE_API_KEY"');
    // Points to custom CLAUDE_CONFIG_DIR path
    expect(settings.statusLine).toEqual({
      type: "command",
      command: path.join(tmp, "cruise-statusline.sh"),
    });
  });

  it("disable safely removes Cruise config and preserves other user settings", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "cruise-cli-test-"));
    const settingsPath = path.join(tmp, "settings.json");

    // Enable first
    runCli(["enable"], { CLAUDE_CONFIG_DIR: tmp, CRUISE_API_KEY: LIVE_KEY });
    let settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(settings.env.ANTHROPIC_BASE_URL).toBe("https://cruise.bytesbrains.net");

    // Add extra user settings
    settings.customSetting = true;
    settings.env.CUSTOM_ENV = "stay";
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Disable
    const disableOut = runCli(["disable"], { CLAUDE_CONFIG_DIR: tmp });
    expect(disableOut.status).toBe(0);
    expect(disableOut.stdout).toMatch(/BytesBrains Cruise gateway disabled/);

    // Verify settings cleaned up
    const cleaned = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(cleaned.customSetting).toBe(true);
    expect(cleaned.env).toEqual({ CUSTOM_ENV: "stay" });
    expect(cleaned.apiKeyHelper).toBeUndefined();
    expect(cleaned.statusLine).toBeUndefined();

    // Disable again is a clean no-op
    const noopOut = runCli(["disable"], { CLAUDE_CONFIG_DIR: tmp });
    expect(noopOut.status).toBe(0);
    expect(noopOut.stdout).toMatch(/not active/);
  });

  it("disable cleanly removes custom CRUISE_BASE_URL even without bytesbrains substring", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "cruise-cli-test-"));
    const settingsPath = path.join(tmp, "settings.json");

    // Enable with custom URL that does not mention bytesbrains or cruise
    runCli(["enable"], {
      CLAUDE_CONFIG_DIR: tmp,
      CRUISE_API_KEY: LIVE_KEY,
      CRUISE_BASE_URL: "https://my-internal-proxy.local:9000",
    });
    let settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(settings.env.ANTHROPIC_BASE_URL).toBe("https://my-internal-proxy.local:9000");

    // Disable should cleanly remove it
    const disableOut = runCli(["disable"], { CLAUDE_CONFIG_DIR: tmp });
    expect(disableOut.status).toBe(0);
    expect(disableOut.stdout).toMatch(/Removed:\s+.*env\.ANTHROPIC_BASE_URL/);

    const cleaned = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(cleaned.env).toBeUndefined();
  });

  it("disable exits cleanly when settings file does not exist", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "cruise-cli-test-"));
    const out = runCli(["disable"], { CLAUDE_CONFIG_DIR: tmp });
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/not active/);
  });

  it("status reports gateway configuration accurately", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "cruise-cli-test-"));
    const before = runCli(["status"], { CLAUDE_CONFIG_DIR: tmp });
    expect(before.stdout).toMatch(/Disabled/);

    runCli(["enable"], { CLAUDE_CONFIG_DIR: tmp, CRUISE_API_KEY: LIVE_KEY });
    const after = runCli(["status"], { CLAUDE_CONFIG_DIR: tmp });
    expect(after.stdout).toMatch(/Enabled/);
    expect(after.stdout).toMatch(/https:\/\/cruise\.bytesbrains\.net/);
  });
});

