<p align="center">
  <img src="assets/cruise-logo.svg" alt="Cruise" width="280" />
</p>

<h1 align="center">BytesBrains Cruise for Claude Code</h1>

<p align="center">
  <a href="https://github.com/bytesbrains/cruise-claude-plugin/actions/workflows/ci.yml"><img src="https://github.com/bytesbrains/cruise-claude-plugin/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@bytesbrains/claude-code-cruise"><img src="https://img.shields.io/npm/v/@bytesbrains/claude-code-cruise?label=npm&amp;color=3b82f6" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-22d3ee" alt="License: Apache-2.0" /></a>
  <a href="https://bytesbrains.com/cruise"><img src="https://img.shields.io/badge/product-bytesbrains.com%2Fcruise-a855f7" alt="Product" /></a>
</p>

[BytesBrains Cruise](https://cruise.bytesbrains.net/docs) is one endpoint in front of every model
provider, with per-project keys, budgets that stop a runaway loop, and a ledger of every request.
This plugin brings it into Claude Code.

## Install

```
/plugin marketplace add bytesbrains/cruise-claude-plugin
/plugin install cruise@bytesbrains
```

Put a Cruise key in your environment — a shell profile or a secret manager, **not** a settings
file — and restart Claude Code:

```sh
export CRUISE_API_KEY=cru_live_…
```

Then run **`/cruise:setup`**. It checks the key, confirms the MCP server answers, and — only if
you agree — routes Claude Code's own model requests through Cruise and adds the spend status line.

To try it without spending anything, use the demo: `export CRUISE_BASE_URL=https://cruise-demo.bytesbrains.net`
with a `cru_demo_` key.

### From npm

Every release is also published to npm as
[`@bytesbrains/claude-code-cruise`](https://www.npmjs.com/package/@bytesbrains/claude-code-cruise),
at the same version as the marketplace. Releases from v0.1.4 on are published by this repo's
release workflow, with [provenance](https://docs.npmjs.com/generating-provenance-statements)
linking the package to the commit it was built from. The package is for your own marketplace,
for example an internal one that pins versions or mirrors a registry. Point an entry at it:

```json
{ "name": "cruise", "source": { "source": "npm", "package": "@bytesbrains/claude-code-cruise" } }
```

### Standalone CLI Bootstrapper

When a Claude subscription is expired or quota is exhausted, or when Claude Code is locked out by an authentication helper failure because `CRUISE_API_KEY` was not exported in a new terminal, Claude Code fails before it can execute any prompt or slash command. To resolve this offline:

```sh
# Run Claude on-demand through Cruise without touching global settings
npx @bytesbrains/claude-code-cruise run [args...]
# or binary alias:
claude-cruise [args...]

# Enable Cruise gateway routing & status line globally
npx @bytesbrains/claude-code-cruise enable

# Or configure Cruise for the current repository only (./.claude/settings.json)
npx @bytesbrains/claude-code-cruise enable --local

# Switch active model or lane (globally or locally with --local)
npx @bytesbrains/claude-code-cruise switch bb/agentic-coding

# Check current gateway status and auto-upgrade legacy settings
npx @bytesbrains/claude-code-cruise status

# Safely revert to standard Anthropic routing offline
npx @bytesbrains/claude-code-cruise disable
```

## What is inside

| | |
|---|---|
| **CLI `claude-code-cruise` / `claude-cruise`** | Standalone bootstrapper and on-demand launcher (`claude-cruise`, `run`, `enable`, `disable`, `switch`) with global and project-level (`--local`) scope |
| **MCP server `cruise`** | Three read-only tools about your key's own project: `list_models` (models and lanes you can reach, with prices), `get_budget` (what is left, and whether the next request is served), `get_spend` (a month's charges by model or lane). Reads `CRUISE_API_KEY` and `CRUISE_BASE_URL` from the environment |
| **Command `/cruise:connect`** | Route Claude Code through Cruise and install the spend status line in one step |
| **Command `/cruise:disconnect`** | Disconnect from Cruise gateway and restore standard Anthropic routing |
| **Command `/cruise:models`** | List available Cruise models and lanes with pricing, capabilities, and active selection |
| **Command `/cruise:status`** | Inspect real-time project budget limits, wallet balance, and serve/refuse status (`/cruise:budget`) |
| **Command `/cruise:spend`** | View monthly ledger spend breakdown by lane and by concrete model (`/cruise:spend [month]`) |
| **Command `/cruise:switch`** | Switch Claude Code's active model or lane in `~/.claude/settings.json` |
| **Skill `cruise`** | When Claude works through Cruise: choosing a lane or a pinned model, and what each Cruise refusal means — `budget_exhausted` waits for the period, `wallet_exhausted` needs credit |
| **Skill `/cruise:setup`** | The guided setup above. Runs only when you invoke it, and asks before changing any file |
| **Status line** | Your project's spend this budget period and its state, cached for a minute. Installed by `/cruise:setup` |

## Try it

Once `/cruise:setup` (or `/cruise:connect`) reports the MCP server answering:

- **`/cruise:connect`** → Enable Cruise gateway routing and status line in 1 step
- **`/cruise:disconnect`** → Revert to native Anthropic subscription routing
- **`/cruise:models`** → View reachable models, lanes, and pricing
- **`/cruise:status`** (or **`/cruise:budget`**) → Inspect current budget, wallet balance, and serve/refuse status
- **`/cruise:spend [month]`** → Breakdown monthly spend by lane and model (e.g. `/cruise:spend 2026-09`)
- **`/cruise:switch <model-or-lane>`** → Switch active model (e.g. `/cruise:switch bb/agentic-coding`)
- *"Which Cruise models and lanes can this key reach, and what do they cost?"* → `list_models`
- *"How much of this project's Cruise budget is left, and will my next request be served?"* →
  `get_budget`
- *"What did this project spend on Cruise last month, broken down by lane?"* → `get_spend`
- *"Cruise refused with `budget_exhausted`. What does that mean and what should I do?"* → the
  `cruise` skill, which explains every refusal code

The tools read only your key's own project and never change anything.

## Troubleshooting

| You see | Means | Do |
|---|---|---|
| `/cruise:setup` or the MCP server: **401 "Incorrect API key provided"**, with `CRUISE_API_KEY` unset when Claude Code started | Claude Code sent an empty key. It reads its environment once, at start | Export the key in your shell, quit Claude Code, reopen it from that shell |
| `Your apiKeyHelper script is failing` | `CRUISE_API_KEY` is not exported in this terminal (or legacy helper configured) | Export `CRUISE_API_KEY` and restart, run `npx @bytesbrains/claude-code-cruise status` to auto-upgrade, or `disable` to revert offline |
| The same 401 with the key set | The key is wrong for this Cruise host, or revoked | Check `CRUISE_BASE_URL` against the key's prefix: a `cru_demo_` key only works with the demo host. Then ask for a new key |
| No `cruise` server in `/mcp` | The plugin is not installed or not enabled | Run `/plugin` |
| Status line: `Cruise: set CRUISE_API_KEY` | The key is not in the status line's environment | Export it where Claude Code starts |
| Status line: `Cruise: CRUISE_API_KEY is not a Cruise key` | The value has characters a Cruise key cannot have, so it was never sent | Check for quotes or a trailing newline in the value |
| Status line: `Cruise: no answer from <url>` | Cruise did not answer within three seconds, or answered with something else | Check the URL. The line retries after its one-minute cache |
| A request refused with `budget_exhausted` | The project's cap for this period is spent | Wait for the period to reset, or raise the cap |
| A request refused with `wallet_exhausted` | The account is out of credit. Waiting does not help | Top up the wallet |

To stop routing Claude Code through Cruise, remove the keys `/cruise:setup` added to
`~/.claude/settings.json`: the `ANTHROPIC_*` and `CLAUDE_CODE_ATTRIBUTION_HEADER` entries under
`env`, plus `apiKeyHelper` and `statusLine`.

## Worth knowing

- **Routing Claude Code through Cruise replaces your claude.ai subscription** for as long as it
  is configured, and bills the Cruise key instead.
- **Lanes may be served by non-Claude models**, which Anthropic does not support behind a gateway.
  Pin a Claude model if you want Claude.
- Cruise translates Anthropic's format rather than passing it through, so Claude's
  extended-thinking blocks do not pass through, and Claude Code turns off
  on-demand tool search behind any gateway.
- **Session affinity & prompt caching**: When routing through Cruise lanes (like `bb/agentic-coding`),
  `x-cruise-session` pins member model selection across multi-turn agent sessions (1-hour sliding
  inactivity TTL), preserving upstream prompt caching instead of redrawing a member model each turn.
- **Traffic class attribution**: `x-cruise-class: agentic` tags Claude Code requests in the Cruise
  cost ledger, keeping agentic coding spend distinct from interactive chat or batch pipelines.
- The plugin never writes your key anywhere. It reaches only the Cruise base URL you configure.

## Links

| | |
|---|---|
| Product | [bytesbrains.com/cruise](https://bytesbrains.com/cruise) |
| Cruise docs | [cruise.bytesbrains.net/docs](https://cruise.bytesbrains.net/docs) |
| Marketplace | `/plugin marketplace add bytesbrains/cruise-claude-plugin` |
| npm | [`@bytesbrains/claude-code-cruise`](https://www.npmjs.com/package/@bytesbrains/claude-code-cruise) |
| Releases | [tags](https://github.com/bytesbrains/cruise-claude-plugin/tags). The plugin's version is in [`plugin.json`](plugins/cruise/.claude-plugin/plugin.json) |
| Privacy and terms | [bytesbrains.com/privacy](https://bytesbrains.com/privacy) (with Cruise's own sections) · [bytesbrains.com/terms](https://bytesbrains.com/terms) |
| Issues and security | [issues](https://github.com/bytesbrains/cruise-claude-plugin/issues). Report vulnerabilities as [`SECURITY.md`](SECURITY.md) describes, not in an issue |

## Development

This repository is the source of the plugin. Develop, test and release it here. A change is a
pull request here, and a bug or request is an issue here. `npm ci && npm test` runs the plugin's
contract tests. [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the checks and how a release is cut.
To report a vulnerability, see [`SECURITY.md`](SECURITY.md).

## Licence

[Apache-2.0](LICENSE); see [`NOTICE`](NOTICE). The plugin carries the same text in
[`plugins/cruise/`](plugins/cruise/LICENSE.txt), because that directory is all an install copies.
The license covers this plugin's code only. The Cruise service is governed by the terms of service
of BytesBrains Pte. Ltd., and the BytesBrains and Cruise names are not licensed. Releases up to
v0.1.1 keep the licence they shipped with.
