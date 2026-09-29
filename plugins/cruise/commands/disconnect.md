---
description: Disconnect Claude Code from Cruise gateway and restore standard Anthropic routing
disable-model-invocation: true
---

# Disconnect from BytesBrains Cruise

Revert Claude Code back to direct Anthropic API / subscription routing by removing Cruise gateway settings.

> **Normally handled without a model.** The plugin's `UserPromptExpansion` hook
> (`hooks/disconnect.js`) runs `/cruise:disconnect` locally before the prompt is sent, so a
> missing or refused `CRUISE_API_KEY`, an exhausted budget or an unreachable gateway cannot block
> it. These instructions only run when hooks are turned off. If the active model is failing
> then too, quit Claude Code and run `npx @bytesbrains/claude-code-cruise@latest disable` (add
> `--local` for a project-level setup) instead. It needs no model, no network and no
> `CRUISE_API_KEY`.

## 1. Inspect `~/.claude/settings.json`
 
If `--local` is specified, inspect and revert `./.claude/settings.json` in the current repository instead of `~/.claude/settings.json`.

Read `~/.claude/settings.json` (or `./.claude/settings.json` if `--local`).
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
     - Every model selector — `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`,
       `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`,
       `ANTHROPIC_SMALL_FAST_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL` — set to a Cruise lane
       (`bb/*`) or a pinned provider model (`provider/model`, e.g.
       `google-ai-studio/gemini-3.8-flash`, `deepseek/deepseek-flash`). The Anthropic API rejects
       these once native routing is back. Keep native Anthropic ids such as `claude-opus-5-5`,
       and keep provider models when another gateway's `ANTHROPIC_BASE_URL` or
       `CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX` remains.
     - `CLAUDE_CODE_ATTRIBUTION_HEADER` (if set to `"0"`)
     - `CLAUDE_CODE_AUTO_MODE_SERVER` (if set to `"0"`)
     - `CLAUDE_CODE_MAX_CONTEXT_TOKENS` (if set to `"1000000"`)
     - `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT` (if set to `"1"`)
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
- Mention that they can use Cruise again without touching `~/.claude/settings.json` by starting
  `claude-cruise` (or `npx @bytesbrains/claude-code-cruise@latest run`), which routes only that session
  through Cruise.
