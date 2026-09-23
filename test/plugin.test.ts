// The Claude Code plugin (#388): what gets published, held before it is.
//
// The plugin is JSON, Markdown and a shell script, so what is worth testing is
// the contract each file makes — the manifest and marketplace agree, the MCP
// config reads the key from the environment and never carries one, every skill
// says when it applies, and the status line prints what it should from the
// answer Cruise actually gives.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
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
    // package.json carries one too, for npm; it follows the manifest.
    expect(json("package.json").version).toBe(manifest.version);
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
