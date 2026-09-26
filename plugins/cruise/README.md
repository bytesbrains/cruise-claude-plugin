<p align="center">
  <img src="https://raw.githubusercontent.com/bytesbrains/cruise-claude-plugin/main/assets/cruise-logo.svg" alt="Cruise" width="280" />
</p>

# BytesBrains Cruise for Claude Code

[BytesBrains Cruise](https://cruise.bytesbrains.net/docs) is one endpoint in front of every model
provider, with per-project keys, budgets that stop a runaway loop, and a ledger of every request.
This package is the Cruise plugin for Claude Code. Its root is the plugin root.

## Install

Most people install from the marketplace, which needs nothing from npm:

```
/plugin marketplace add bytesbrains/cruise-claude-plugin
/plugin install cruise@bytesbrains
```

This package is for your own marketplace, for example an internal one that pins versions or
serves plugins from a private registry mirror. Point an entry at it:

```json
{
  "name": "cruise",
  "source": { "source": "npm", "package": "@bytesbrains/claude-code-cruise", "version": "^0.1.7" }
}
```

Then put a Cruise key in your environment, restart Claude Code and run `/cruise:setup` (or `/cruise:connect`):

```sh
export CRUISE_API_KEY=cru_live_…
```

## What is inside

- **MCP server `cruise`**: three read-only tools, `list_models`, `get_budget` and `get_spend`,
  about your key's own project.
- **Command `/cruise:connect`**: route Claude Code through Cruise and install the status line in 1 step.
- **Command `/cruise:disconnect`**: disconnect from Cruise and revert to standard Anthropic routing.
- **Command `/cruise:models`**: list reachable models and lanes with pricing and active selection.
- **Command `/cruise:switch`**: switch Claude Code's active model or lane in `~/.claude/settings.json`.
- **Skill `cruise`**: choosing a lane or a pinned model, and what each Cruise refusal means.
- **Skill `/cruise:setup`**: guided setup. It runs only when you invoke it, and asks before it
  changes any file.
- **Status line**: your project's spend this budget period, cached for a minute.

The full guide is in the [repository](https://github.com/bytesbrains/cruise-claude-plugin#readme).

## Licence

Apache-2.0; see `LICENSE.txt` and `NOTICE`. The licence covers this plugin's code only. The Cruise
service is governed by the terms of service of BytesBrains Pte. Ltd., and the BytesBrains and
Cruise names and marks are not licensed.
