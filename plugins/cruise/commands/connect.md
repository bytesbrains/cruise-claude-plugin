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

If the user specifies `--local` (or runs in project mode), apply these settings to `./.claude/settings.json` in the current repository instead of `~/.claude/settings.json`.

Read `~/.claude/settings.json` (or `./.claude/settings.json` if `--local`, initialized as `{}` if absent) and merge:

1. **`env` configuration (Deep merge)**:
   - Read the existing `env` object. **Preserve all unrelated environment variables** (e.g. custom user variables like `FOO`, `BAR`, etc.).
   - Merge the Cruise gateway keys into `env`:
     ```json
     {
       "env": {
         "ANTHROPIC_BASE_URL": "<detected-base-url>",
         "ANTHROPIC_MODEL": "<current env.ANTHROPIC_MODEL or bb/agentic-coding>",
         "ANTHROPIC_DEFAULT_HAIKU_MODEL": "bb/chat-assistant",
         "CLAUDE_CODE_ATTRIBUTION_HEADER": "0",
         "CLAUDE_CODE_AUTO_MODE_SERVER": "0",
         "ANTHROPIC_CUSTOM_HEADERS": "x-cruise-class: agentic\nx-cruise-session: claude-code-<uuid>"
       }
     }
     ```
   - **`CLAUDE_CODE_AUTO_MODE_SERVER: "0"`**: Tells Claude Code not to query the gateway for server-side classifier checks in Auto Mode until Cruise implements the server-side safeguards protocol ([auto mode classifier billing](https://code.claude.com/docs/en/auto-mode-classifier-billing)), avoiding compatibility notices and prompt holds.
   - **Gateway Custom Headers (`ANTHROPIC_CUSTOM_HEADERS`)**:
     - `x-cruise-class: agentic`: Tags all Claude Code requests in the Cruise cost ledger under the `agentic` traffic class, separating agentic coding spend from interactive chat or batch pipelines.
     - `x-cruise-session: claude-code-<id>`: Session affinity header (1–128 characters matching `[A-Za-z0-9._:-]`). Cruise uses this to pin member model selection for the duration of an agent workflow (1-hour sliding TTL refreshed per request) when routing through Cruise lanes like `bb/agentic-coding`. This prevents mid-session model shifts and maintains upstream prompt caching across multi-turn agent sessions.
     - If `ANTHROPIC_CUSTOM_HEADERS` already exists, preserve existing non-Cruise custom headers (merge them newline-separated). Preserve any pre-existing `x-cruise-session` if already configured unless an explicit override is requested.
2. **`apiKeyHelper`**:
   ```json
   {
     "apiKeyHelper": "printf %s \"${CRUISE_API_KEY:-missing_cruise_key}\""
   }
   ```
   Uses a non-empty fallback token (`missing_cruise_key`) when `CRUISE_API_KEY` is unset or empty, ensuring Claude Code does not treat the helper script as failing and lock out slash commands like `/cruise:disconnect` or `/cruise:setup`.
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

## 5. Gateway Session Affinity & Traffic Class Evaluation

- **Prompt Caching on Lanes**:
  Cruise lanes (such as `bb/agentic-coding`) dynamically allocate member models per request based on routing policy and gates. In multi-turn agentic coding sessions, if turn 1 routes to Model A and turn 2 routes to Model B, upstream prompt caching (Anthropic prompt cache / provider KV cache) is completely lost between turns, leading to increased token latency and cost.
  Sending `x-cruise-session` pins member model selection for the session. The first turn allocates normally and returns `x-cruise-affinity: new`; subsequent turns with the same key maintain the pinned member (`x-cruise-affinity: pinned`), ensuring prompt cache hits across turns. Cruise enforces a 1-hour TTL on the pin (refreshed on each request), so idle sessions expire naturally without permanently locking an allocation.
- **Session Identifier Strategies**:
  1. *Stable Identifier in `settings.json` (Turnkey Default)*:
     Configuring a stable session identifier (e.g. `claude-code-<uuid>`) in `settings.json` via `ANTHROPIC_CUSTOM_HEADERS` gives seamless out-of-the-box session affinity across multi-turn workflows. Cruise's 1-hour sliding inactivity TTL ensures that new agent workflows started after an idle period redraw fresh allocations.
  2. *Per-Terminal Session Affinity (Shell Environment)*:
     For power users running concurrent Claude Code instances across multiple terminal windows who want isolated affinity pins per shell session, `ANTHROPIC_CUSTOM_HEADERS` can be set in the shell profile (`~/.zshrc` or `~/.bashrc`):
     ```sh
     export ANTHROPIC_CUSTOM_HEADERS="x-cruise-class: agentic"$'\n'"x-cruise-session: $(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s)"
     ```
  3. *Native Claude Code Session ID & Gateway Hint Headers*:
     Claude Code automatically transmits `x-claude-code-session-id` on its HTTP calls, and setting `CLAUDE_CODE_GATEWAY_HINT_HEADERS=1` transmits `x-claude-code-prompt-id`. Cruise gateways can inspect `x-claude-code-session-id` as a fallback when `x-cruise-session` is not explicitly set.
  4. *Status Line Separation*:
     Claude Code passes `{ "session_id": "...", ... }` via stdin to the status line script, but the status line runs out-of-band asynchronously for UI rendering and cannot inject request headers into Claude Code's model calls. Request headers must be supplied via `settings.json` `env.ANTHROPIC_CUSTOM_HEADERS` or the process environment.

## 6. Confirm & Next Steps

1. Display the summary of applied gateway settings (including base URL, models, and custom headers) and the diff.
2. Remind the user to restart Claude Code (`quit` and reopen) for the gateway routing to take effect.
3. Advise them to run `/status` after restart to confirm that Base URL points to Cruise and Credential Source is `apiKeyHelper`.
