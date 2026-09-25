---
description: Switch Claude Code's active model or lane through Cruise
argument-hint: "[model-or-lane]"
disable-model-invocation: true
---

# Switch Active Model or Lane

Switch Claude Code's active model (`ANTHROPIC_MODEL` in `~/.claude/settings.json`) to a Cruise lane (e.g. `bb/agentic-coding`) or pinned model (e.g. `anthropic/claude-sonnet-5`).

Target model or lane requested by user: `$1`

## 1. Select Model or Lane

- If `$1` is provided, use that as the desired model or lane.
- If `$1` is not provided:
  1. Call the `cruise` MCP server's `list_models` tool (or run `/cruise:models`) to display available lanes and pinned models.
  2. Ask the user which model or lane they want to switch to before proceeding.

## 2. Update `~/.claude/settings.json`

Once the model or lane is chosen:

1. Read `~/.claude/settings.json` (create it if absent).
2. Ensure the `env` object exists and set `"ANTHROPIC_MODEL": "<chosen-model-or-lane>"`.
3. **Preserve all other keys** in `settings.json` and within `env` (such as `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_ATTRIBUTION_HEADER`, `apiKeyHelper`, `statusLine`, `enabledPlugins`, etc.). Never overwrite other settings.
4. If `env.ANTHROPIC_BASE_URL` is not set, advise the user that model traffic is not yet routed through Cruise, and suggest running `/cruise:setup` to complete gateway configuration.
5. Display the diff or JSON change before saving.

## 3. Confirm & Restart

- Confirm that `env.ANTHROPIC_MODEL` in `~/.claude/settings.json` has been updated.
- Remind the user to restart Claude Code (`quit` and reopen) for the changes to take effect.
- Mention that they can verify the active model with `/status` or `/cruise:models` after restart.
