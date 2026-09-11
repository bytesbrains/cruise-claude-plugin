---
name: setup
description: Set up BytesBrains Cruise in Claude Code — check the key, confirm the MCP server answers, and with the user's consent route Claude Code's own model requests through Cruise and add the spend status line.
disable-model-invocation: true
---

# Set up BytesBrains Cruise

Walk the user through these steps in order. **Ask before changing any file**, show what will
change, and never print, repeat or write the Cruise key (`cru_…`). If the user pastes a key into
the conversation, do not echo it back; tell them to keep it in their environment instead.

## 1. The key

Check whether it is set, without revealing it:

```sh
test -n "$CRUISE_API_KEY" && echo "CRUISE_API_KEY is set" || echo "CRUISE_API_KEY is missing"
```

If it is missing, tell the user to:
- get a key from their Cruise dashboard (or from whoever runs their Cruise account), ideally
  one scoped to the models they will use and rate-limited, since it will live on this machine;
- put it in their environment — a shell profile line `export CRUISE_API_KEY=…`, or their
  secret manager — **not** in a Claude Code settings file;
- restart Claude Code so it inherits the variable, then run `/cruise:setup` again.

For the demo, which costs nothing, they can also `export CRUISE_BASE_URL=https://cruise-demo.bytesbrains.net`
with a `cru_demo_` key.

## 2. The MCP server

Call the `cruise` MCP server's `get_budget` tool. If it answers with a project name, this half
works. If the server is missing or reports a missing variable, the key was not in Claude Code's
environment when it started — restart from a shell where `CRUISE_API_KEY` is set.

## 3. Route Claude Code's models through Cruise (optional — ask first)

Explain what this changes before asking:
- Claude Code's own model requests go to Cruise, so they are held to the project's budget and
  land in its cost ledger. While it is active, the user's claude.ai subscription is **not** used.
- Models are named as Cruise names them. A lane such as `bb/agentic-coding` may be served by a
  non-Claude model; Anthropic does not support non-Claude models behind a gateway, so a pinned
  Claude model (for example `anthropic/claude-sonnet-5`, if `list_models` shows it) is the choice
  for Claude itself.
- In this version of Cruise, Claude's extended-thinking blocks and Anthropic prompt caching do
  not pass through, and Claude Code turns off on-demand tool search behind any gateway.

If the user agrees, read `~/.claude/settings.json` (create it if absent), **merge** — never
overwrite other keys — and show the diff before writing:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://cruise.bytesbrains.net",
    "ANTHROPIC_MODEL": "bb/agentic-coding",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "bb/chat-assistant"
  },
  "apiKeyHelper": "printf %s \"$CRUISE_API_KEY\""
}
```

Use the user's `CRUISE_BASE_URL` instead if it is set, and the model they choose for
`ANTHROPIC_MODEL`. The helper reads the key from the environment at run time, so the key itself
never enters the settings file; Claude Code sends the helper's output in both headers Cruise
accepts. Then tell them to restart Claude Code and run `/status`: the base URL should be
Cruise's and the credential source `apiKeyHelper`. To undo, remove those keys.

## 4. The spend status line (optional — ask first)

The plugin's own folder is renamed on every update, so a status line pointing into it would
break. Copy the script to a stable path instead:

```sh
cp "${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh" ~/.claude/cruise-statusline.sh
chmod +x ~/.claude/cruise-statusline.sh
```

Then merge into `~/.claude/settings.json` — and if a `statusLine` is already set, ask before
replacing it:

```json
{ "statusLine": { "type": "command", "command": "~/.claude/cruise-statusline.sh" } }
```

It shows the project's spend for its budget period and whether the next request is served,
refreshed at most once a minute. Tell the user to run `/cruise:setup` again after a plugin
update to refresh the copy.

## 5. Finish

Summarise exactly what changed and where, and how to undo each part.
