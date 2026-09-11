# BytesBrains Cruise for Claude Code

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

## Licence

See [`plugins/cruise/LICENSE.txt`](plugins/cruise/LICENSE.txt). Published from the
`clients/claude-code/` directory of BytesBrains Cruise.
