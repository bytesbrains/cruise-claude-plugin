<p align="center">
  <img src="assets/cruise-logo.svg" alt="Cruise" width="280" />
</p>

<h1 align="center">BytesBrains Cruise for Claude Code</h1>

<p align="center">
  <a href="https://github.com/bytesbrains/cruise-claude-plugin/actions/workflows/ci.yml"><img src="https://github.com/bytesbrains/cruise-claude-plugin/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="plugins/cruise/.claude-plugin/plugin.json"><img src="https://img.shields.io/github/package-json/v/bytesbrains/cruise-claude-plugin?label=plugin&amp;color=3b82f6" alt="Plugin version" /></a>
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

The plugin is also published to npm as
[`@bytesbrains/claude-code-cruise`](https://www.npmjs.com/package/@bytesbrains/claude-code-cruise),
with provenance. It is for your own marketplace, for example an internal one that pins versions
or mirrors a registry. Point an entry at it:

```json
{ "name": "cruise", "source": { "source": "npm", "package": "@bytesbrains/claude-code-cruise" } }
```

## What is inside

| | |
|---|---|
| **MCP server `cruise`** | Three read-only tools about your key's own project: `list_models` (models and lanes you can reach, with prices), `get_budget` (what is left, and whether the next request is served), `get_spend` (a month's charges by model or lane). Reads `CRUISE_API_KEY` and `CRUISE_BASE_URL` from the environment |
| **Skill `cruise`** | When Claude works through Cruise: choosing a lane or a pinned model, and what each Cruise refusal means — `budget_exhausted` waits for the period, `wallet_exhausted` needs credit |
| **Skill `/cruise:setup`** | The guided setup above. Runs only when you invoke it, and asks before changing any file |
| **Status line** | Your project's spend this budget period and its state, cached for a minute. Installed by `/cruise:setup` |

## Worth knowing

- **Routing Claude Code through Cruise replaces your claude.ai subscription** for as long as it
  is configured, and bills the Cruise key instead.
- **Lanes may be served by non-Claude models**, which Anthropic does not support behind a gateway.
  Pin a Claude model if you want Claude.
- Cruise currently translates Anthropic's format rather than passing it through, so Claude's
  extended-thinking blocks and prompt caching do not survive the trip, and Claude Code turns off
  on-demand tool search behind any gateway.
- The plugin never writes your key anywhere. It reaches only the Cruise base URL you configure.

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
