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
    *[!A-Za-z0-9_-]*) echo "INVALID_CHARS" ;;
    cru_live_*|cru_test_*|cru_demo_*|cru_svc_*) echo "KEY_OK" ;;
    *) echo "UNKNOWN_PREFIX" ;;
  esac
fi
```

- If `MISSING_KEY`:
  - Inform the user that `CRUISE_API_KEY` must be set in their environment (e.g. `export CRUISE_API_KEY="cru_..."` in `~/.zshrc`).
  - Instruct them to export the key, restart Claude Code, and run `/cruise:connect` again. Halt immediately.
- If `INVALID_CHARS`:
  - Inform the user that their key contains invalid characters (such as quotes or whitespace). Halt immediately.
- If `UNKNOWN_PREFIX`:
  - If `CRUISE_BASE_URL` is set, proceed. Otherwise, inform the user that their key does not have a recognized Cruise prefix (`cru_live_`, `cru_test_`, `cru_demo_`, `cru_svc_`). Ask them to check the key or set `CRUISE_BASE_URL`. Halt immediately.

## 2. Detect Cruise Base URL

Determine the appropriate Cruise endpoint:
- If `CRUISE_BASE_URL` is explicitly set in the environment, use its value.
- Otherwise, map by key prefix:
  - If `CRUISE_API_KEY` starts with `cru_demo_`: use `https://cruise-demo.bytesbrains.net`
  - If `CRUISE_API_KEY` starts with `cru_test_`: use `https://cruise-staging.bytesbrains-cruise.workers.dev`
  - If `CRUISE_API_KEY` starts with `cru_live_` or `cru_svc_`: use `https://cruise.bytesbrains.net`

## 3. Install Status Line Script

Install the spend status line script to a stable user location:

```sh
mkdir -p ~/.claude
statusline_copied=0

if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh" ]; then
  cp "${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh" ~/.claude/cruise-statusline.sh
  chmod +x ~/.claude/cruise-statusline.sh
  statusline_copied=1
elif [ -f ~/.claude/cruise-statusline.sh ]; then
  chmod +x ~/.claude/cruise-statusline.sh
  statusline_copied=1
fi
```

- If `~/.claude/cruise-statusline.sh` cannot be located and copied:
  - Warn the user that the status line script was not found. Do NOT configure a broken `statusLine` in settings.json.

## 4. Update `~/.claude/settings.json`

Read `~/.claude/settings.json` (initialize as `{}` if absent) and merge:

1. **`env` configuration (Deep merge)**:
   - Read the existing `env` object. **Preserve all unrelated environment variables** (e.g. custom user variables like `FOO`, `BAR`, etc.).
   - Merge the Cruise gateway keys into `env`:
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
   Only configure `statusLine` if `statusline_copied` was successful and `~/.claude/cruise-statusline.sh` exists and is executable:
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

1. Display the summary of applied gateway settings and the diff.
2. Remind the user to restart Claude Code (`quit` and reopen) for the gateway routing to take effect.
3. Advise them to run `/status` after restart to confirm that Base URL points to Cruise and Credential Source is `apiKeyHelper`.
