---
description: Disconnect Claude Code from Cruise gateway and restore standard Anthropic routing
disable-model-invocation: true
---

# Disconnect from BytesBrains Cruise

Revert Claude Code back to direct Anthropic API / subscription routing by removing Cruise gateway settings.

## 1. Inspect `~/.claude/settings.json`

Read `~/.claude/settings.json`.
Check if `~/.claude/settings.json` exists and whether it contains Cruise gateway settings (e.g. `ANTHROPIC_BASE_URL` containing `bytesbrains` or matching Cruise, or `apiKeyHelper` referencing `CRUISE_API_KEY`).

- If `~/.claude/settings.json` is missing or contains no Cruise gateway configuration:
  - Inform the user that Cruise routing is not active.
  - **Halt immediately**. Do not perform any edits or save any file.

## 2. Revert Settings

Safely remove the Cruise gateway overrides while preserving all other user settings:

1. **Remove Gateway Environment Keys**:
   Within the `env` object of `~/.claude/settings.json`:
   - If `ANTHROPIC_BASE_URL` points to Cruise (`*bytesbrains*`), remove:
     - `ANTHROPIC_BASE_URL`
     - `ANTHROPIC_MODEL` (if set to a Cruise lane like `bb/*` or pinned Cruise model)
     - `ANTHROPIC_DEFAULT_HAIKU_MODEL` (if set to `bb/*`)
     - `CLAUDE_CODE_ATTRIBUTION_HEADER` (if set to `"0"`)
     - `CLAUDE_CODE_AUTO_MODE_SERVER` (if set to `"0"`)
   - **Clean Custom Headers (`ANTHROPIC_CUSTOM_HEADERS`)**:
     - Remove Cruise header lines (`x-cruise-class` and `x-cruise-session`).
     - If other custom headers remain (such as third-party proxy headers), preserve them. If no headers remain after removing Cruise headers, delete `ANTHROPIC_CUSTOM_HEADERS`.
   - **Preserve all other environment variables** that the user may have configured in `env`.
   - If the `env` object becomes completely empty after removing these keys, delete the empty `env` object.

2. **Remove `apiKeyHelper`**:
   If `apiKeyHelper` is configured for `$CRUISE_API_KEY` (or references `CRUISE_API_KEY`), remove the `apiKeyHelper` key.

3. **Revert `statusLine`**:
   If `statusLine.command` points to `~/.claude/cruise-statusline.sh`, remove the `statusLine` object. If the user had a different custom status line, leave it untouched.

4. **Preserve Other Configuration**:
   Retain all other settings such as `enabledPlugins`, `mcpServers`, and permissions intact.

5. Display the removed settings to the user and save the file.

## 3. Confirm & Restart

- Confirm that Cruise gateway configuration has been removed.
- Remind the user to restart Claude Code (`quit` and reopen) to return to standard Anthropic routing.
- Advise them to run `/status` after restart to verify native credentials and endpoints.
