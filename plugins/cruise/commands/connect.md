---
description: Connect Claude Code to BytesBrains Cruise LLM gateway in one step
disable-model-invocation: true
---

# Connect to BytesBrains Cruise

Route Claude Code's model requests through the BytesBrains Cruise LLM gateway and set up the spend status line.

## 1. Verify Environment

Check whether `CRUISE_API_KEY` is present in the environment without echoing its value:

```sh
if [ -z "${CRUISE_API_KEY:-}" ]; then
  echo "MISSING_KEY"
else
  case "$CRUISE_API_KEY" in
    *[!A-Za-z0-9_-]*) echo "INVALID_KEY" ;;
    *) echo "KEY_OK" ;;
  esac
fi
```

- If `MISSING_KEY`:
  - Inform the user that `CRUISE_API_KEY` must be set in their environment (e.g. `export CRUISE_API_KEY="cru_..."` in `~/.zshrc`).
  - Instruct them to export the key, restart Claude Code, and run `/cruise:connect` again. Halt here.
- If `INVALID_KEY`:
  - Inform the user that their key contains unexpected characters (quotes or whitespace). Halt here.

## 2. Detect Cruise Base URL

Determine the appropriate Cruise endpoint:
- If `CRUISE_BASE_URL` is explicitly set in the environment, use its value.
- Otherwise, inspect the key prefix:
  - If `CRUISE_API_KEY` starts with `cru_demo_`: use `https://cruise-demo.bytesbrains.net`
  - If `CRUISE_API_KEY` starts with `cru_test_`: use `https://cruise-staging.bytesbrains-cruise.workers.dev`
  - Otherwise: use `https://cruise.bytesbrains.net`

## 3. Install Status Line Script

Install the spend status line script to a stable user location:

```sh
mkdir -p ~/.claude
# Copy from plugin scripts if available, ensuring executable bit
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh" ]; then
  cp "${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh" ~/.claude/cruise-statusline.sh
  chmod +x ~/.claude/cruise-statusline.sh
fi
```

## 4. Update `~/.claude/settings.json`

Read `~/.claude/settings.json` (initialize as `{}` if absent) and merge:

1. **`env` configuration**:
   ```json
   {
     "env": {
       "ANTHROPIC_BASE_URL": "<detected-base-url>",
       "ANTHROPIC_MODEL": "<current env.ANTHROPIC_MODEL or bb/agentic-coding>",
       "ANTHROPIC_DEFAULT_HAIKU_MODEL": "bb/chat-assistant",
       "CLAUDE_CODE_ATTRIBUTION_HEADER": "0"
     }
   }
   ```
2. **`apiKeyHelper`**:
   ```json
   {
     "apiKeyHelper": "printf %s \"$CRUISE_API_KEY\""
   }
   ```
3. **`statusLine`**:
   If `statusLine` is not set or points to `cruise-statusline.sh`, configure:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "~/.claude/cruise-statusline.sh"
     }
   }
   ```
   *(If a different statusLine is already present, ask user before replacing it).*

**IMPORTANT**: Preserve all other existing keys in `~/.claude/settings.json` (such as `enabledPlugins`, `mcpServers`, etc.).

## 5. Confirm & Next Steps

1. Display the summary of applied gateway settings.
2. Remind the user to restart Claude Code (`quit` and reopen) for the gateway routing to take effect.
3. Advise them to run `/status` after restart to confirm that Base URL points to Cruise and Credential Source is `apiKeyHelper`.
