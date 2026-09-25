---
description: Switch Claude Code's active model or lane through Cruise
argument-hint: "[model-or-lane]"
disable-model-invocation: true
---

# Switch Active Model or Lane

Switch Claude Code's active model (`ANTHROPIC_MODEL` in `~/.claude/settings.json`) to a Cruise lane (e.g. `bb/agentic-coding`) or pinned model (e.g. `anthropic/claude-sonnet-5`).

Target model or lane requested by user: `$ARGUMENTS`

## 1. Validate & Select Model or Lane

1. Query reachable models and lanes by calling the `cruise` MCP server's `list_models` tool (or querying `GET /v1/models` directly if MCP is unavailable).
2. Determine target selection from `$ARGUMENTS` (trimmed):
   - **If `$ARGUMENTS` is provided**:
     - Check whether the requested value matches a valid lane ID (e.g. `bb/agentic-coding`, `bb/chat-assistant`, `bb/code-review`) or pinned model ID (e.g. `anthropic/claude-sonnet-5`, `deepseek/deepseek-flash`) in the catalogue.
     - If the model or lane is **not found**: do NOT update settings. Inform the user that the model or lane is not recognized or not reachable for this key, display the available lanes and popular models, and ask them to select a valid ID.
     - If it is valid: proceed to step 2 with the verified ID.
   - **If `$ARGUMENTS` is empty**:
     - Present the list of available lanes and popular models from `list_models`.
     - Prompt the user to choose which lane or model they want to switch to before proceeding.

## 2. Update `~/.claude/settings.json`

Once a valid model or lane is verified:

1. Read `~/.claude/settings.json` (create it if absent).
2. Ensure the `env` object exists and set `"ANTHROPIC_MODEL": "<verified-model-or-lane>"`.
3. **Preserve all other keys** in `settings.json` and within `env` (such as `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_ATTRIBUTION_HEADER`, `apiKeyHelper`, `statusLine`, `enabledPlugins`, etc.). Never overwrite or discard existing settings.
4. If `env.ANTHROPIC_BASE_URL` is not set, advise the user that model traffic is not yet routed through Cruise, and suggest running `/cruise:setup` to configure the gateway.
5. Display the diff or JSON change before writing.

## 3. Confirm & Restart

- Confirm that `env.ANTHROPIC_MODEL` in `~/.claude/settings.json` has been updated to the chosen model/lane.
- Remind the user to restart Claude Code (`quit` and reopen) for the environment changes to take effect.
- Mention that they can verify the active model with `/status` or `/cruise:models` after restart.
