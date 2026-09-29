---
description: Update the Cruise plugin to the latest release and refresh status line and settings
disable-model-invocation: true
---

# Update BytesBrains Cruise Plugin

Update the Cruise plugin (`cruise@bytesbrains`) to the latest release in Claude Code, refresh `~/.claude/cruise-statusline.sh` with the new version's script, and check for recommended gateway settings.

## 1. Check Installed vs Latest Version

Determine the currently installed plugin version:
- Read the running plugin's `plugin.json` (at `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`).
- If `${CLAUDE_PLUGIN_ROOT}` is unset or unavailable, check `claude plugin list` or inspect `~/.claude/plugins/installed_plugins.json`.

Determine the latest available version:
- Query the latest release first so comparison is not made against stale cached data:
  - Run `claude plugin marketplace update bytesbrains` (or fetch the latest tag/release from `https://api.github.com/repos/bytesbrains/cruise-claude-plugin/releases/latest` or `git ls-remote --tags https://github.com/bytesbrains/cruise-claude-plugin.git`).
  - Read the updated marketplace entry in `~/.claude/plugins/marketplaces/bytesbrains/plugins/cruise/.claude-plugin/plugin.json`.

Compare versions semantically:
- Compare the version components numerically (e.g. `0.1.16` vs `0.1.9`, like `sort -V` or semver rules), never by simple string/lexicographical comparison.
- Display the comparison:
  - **Installed version**: `<installed_version>`
  - **Latest version**: `<latest_version>`

If the installed version is already equal to or newer than the latest version:
- Inform the user: `Cruise plugin is already up to date (version <installed_version>).`
- Stop here and make no changes.

## 2. Update Marketplace & Plugin

Update the marketplace and plugin to the latest release:

1. Attempt to run the non-interactive Claude Code plugin CLI:
   ```sh
   claude plugin marketplace update bytesbrains && claude plugin update cruise@bytesbrains
   ```
2. If the command fails or non-interactive update is unsupported in the current context, instruct the user to run the slash commands directly:
   ```
   /plugin marketplace update bytesbrains
   /plugin update cruise@bytesbrains
   ```

## 3. Refresh Status Line Script

The plugin's cache folder (`~/.claude/plugins/cache/bytesbrains/cruise/<version>/`) changes on every update, so the status line uses a copied script at `~/.claude/cruise-statusline.sh`.

Check if `~/.claude/cruise-statusline.sh` exists on disk:
- **If `~/.claude/cruise-statusline.sh` does NOT exist**:
  - Do nothing. Do NOT create or configure a `statusLine` entry that the user hasn't set up.
- **If `~/.claude/cruise-statusline.sh` exists**:
  - Find the new version's statusline script:
    - Look in the updated plugin cache directory (e.g. `~/.claude/plugins/cache/bytesbrains/cruise/<new_version>/scripts/statusline.sh`) or the updated marketplace cache (`~/.claude/plugins/marketplaces/bytesbrains/plugins/cruise/scripts/statusline.sh`).
    - Verify that the target script exists and comes from the newly installed/updated version. Do NOT fall back to `${CLAUDE_PLUGIN_ROOT}/scripts/statusline.sh` because `${CLAUDE_PLUGIN_ROOT}` still points to the old version in the currently running session prior to restart.
  - **Ask the user for confirmation** before replacing `~/.claude/cruise-statusline.sh`.
  - If approved, copy the new script:
    ```sh
    cp "<new_scripts_statusline_path>" ~/.claude/cruise-statusline.sh
    chmod +x ~/.claude/cruise-statusline.sh
    ```
  - Ensure the script retains its executable bit (`chmod +x`).
  - Do NOT modify `statusLine` in `settings.json` if it already points to `~/.claude/cruise-statusline.sh`, and do NOT add a `statusLine` entry if the user has not configured one.

## 4. Check & Merge Recommended Gateway Settings

Check if the user is routing model requests through Cruise:
- Inspect global settings (`~/.claude/settings.json`) and local project settings (`./.claude/settings.json`, if present).
- For each file, check if `env.ANTHROPIC_BASE_URL` is set and contains `bytesbrains` or points to Cruise.

If NEITHER file routes through Cruise:
- Skip settings inspection.

If Cruise routing is active:
- Evaluate each settings file (`~/.claude/settings.json` and/or `./.claude/settings.json`) independently. Only propose changes to the specific file(s) where Cruise routing is configured:
  - If only `./.claude/settings.json` routes through Cruise, target only `./.claude/settings.json`.
  - If only `~/.claude/settings.json` routes through Cruise, target only `~/.claude/settings.json`.
  - If both route through Cruise, handle each file separately.
- Compare that file's `env` keys against the recommended gateway settings from `/cruise:connect` and `/cruise:setup`:
  - `ANTHROPIC_BASE_URL`: Cruise gateway endpoint
  - `ANTHROPIC_MODEL`: Active model or lane (e.g. `bb/agentic-coding`)
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`: Fast model (`bb/chat-assistant`)
  - `CLAUDE_CODE_ATTRIBUTION_HEADER`: `"0"`
  - `CLAUDE_CODE_AUTO_MODE_SERVER`: `"0"`
  - `CLAUDE_CODE_MAX_CONTEXT_TOKENS`: `"1000000"`
  - `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT`: `"1"`
  - `ANTHROPIC_CUSTOM_HEADERS`: `x-cruise-class: agentic` and `x-cruise-session: ...`
- Identify any recommended keys that the target settings file lacks.
- **Safety rules**:
  - Never overwrite existing unrelated keys.
  - Never print, echo, repeat, or write the Cruise API key (`cru_...`).
  - If missing recommended keys are identified:
    - Clearly name the exact target file path (e.g. `~/.claude/settings.json` or `./.claude/settings.json`).
    - List the missing keys and explain what each one does.
    - **Ask the user for approval** specifying the exact target file before merging.
    - Show the exact JSON diff per file before writing.

## 5. Changelog & Restart Claude Code

1. If available, show a short summary of changes / highlights between the installed version and the new version (from release notes or `git log`).
2. Remind the user to restart Claude Code (`quit` and reopen) so that the new plugin, MCP server, and commands take effect.
3. Advise them to verify with `/cruise:status` and `/status` after restarting.
