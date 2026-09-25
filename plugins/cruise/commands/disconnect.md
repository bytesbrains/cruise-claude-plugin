---
description: Disconnect Claude Code from Cruise gateway and restore standard Anthropic routing
disable-model-invocation: true
---

# Disconnect from BytesBrains Cruise

Revert Claude Code back to direct Anthropic API / subscription routing by removing Cruise gateway settings.

## 1. Inspect `~/.claude/settings.json`

Read `~/.claude/settings.json`.
If `~/.claude/settings.json` does not exist or carries no Cruise gateway configuration, inform the user that Cruise routing is not active.

## 2. Revert Settings

Safely remove the Cruise gateway overrides while preserving all other user settings:

1. **Remove Gateway Environment Keys**:
   Within the `env` object of `~/.claude/settings.json`, remove:
   - `ANTHROPIC_BASE_URL`
   - `ANTHROPIC_MODEL` (if set to a Cruise lane or model)
   - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
   - `CLAUDE_CODE_ATTRIBUTION_HEADER`
   If `env` has no remaining keys, delete the `env` block. Otherwise, retain all unrelated environment variables.

2. **Remove `apiKeyHelper`**:
   If `apiKeyHelper` is configured for `$CRUISE_API_KEY`, remove the `apiKeyHelper` key.

3. **Revert `statusLine`**:
   If `statusLine.command` points to `~/.claude/cruise-statusline.sh`, remove the `statusLine` object. If the user had a different custom status line, leave it untouched.

4. **Preserve Other Configuration**:
   Retain all other settings such as `enabledPlugins`, `mcpServers`, and permissions intact.

5. Display the removed settings to the user and save the file.

## 3. Confirm & Restart

- Confirm that Cruise gateway configuration has been removed.
- Remind the user to restart Claude Code (`quit` and reopen) to return to standard Anthropic routing.
- Advise them to run `/status` after restart to verify native credentials and endpoints.
