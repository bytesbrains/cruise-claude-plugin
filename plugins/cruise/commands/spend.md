---
description: View Cruise historical ledger spend breakdown by lane and model for a month
argument-hint: "[month]"
---

# Cruise Spend Breakdown

Query the Cruise ledger for charges incurred by this project during a specific calendar month, broken down by lane and by concrete model.

Requested month: `$ARGUMENTS`

## 1. Determine Target Month

1. Parse `$ARGUMENTS` (trimmed):
   - **If specified**:
     - If formatted as `YYYY-MM` (e.g. `2026-09`): use directly.
     - If given as relative terms (e.g. `last month`, `previous month`, or a month name like `August` or `August 2026`): resolve to the appropriate `YYYY-MM` format.
     - If unrecognized or invalid: inform the user and request a month formatted as `YYYY-MM` (e.g. `2026-09`).
   - **If empty**:
     - Default to the current calendar month in UTC (or omit the `month` parameter to allow Cruise to default to the current month).

## 2. Retrieve Spend Data

Call the `cruise` MCP server's `get_spend` tool for both groupings:
1. `get_spend` with `arguments: { "month": "<target-month>", "by": "lane" }`
2. `get_spend` with `arguments: { "month": "<target-month>", "by": "model" }`

If the MCP server is not answering or unconfigured, query the MCP endpoint directly:

```sh
if [ -z "${CRUISE_API_KEY:-}" ]; then
  echo "Cruise: set CRUISE_API_KEY"
  exit 1
fi

case "$CRUISE_API_KEY" in
  *[!A-Za-z0-9_-]*)
    echo "Cruise: CRUISE_API_KEY is not a Cruise key"
    exit 1
    ;;
esac

TARGET_MONTH="${1:-$(date -u +%Y-%m)}"

# Spend breakdown by lane:
body_lane=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_spend","arguments":{"month":"%s","by":"lane"}}}' "$TARGET_MONTH")
printf 'header = "Authorization: Bearer %s"\n' "$CRUISE_API_KEY" | \
  curl -s -m 5 -K - -X POST "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/mcp" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d "$body_lane"

# Spend breakdown by model:
body_model=$(printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_spend","arguments":{"month":"%s","by":"model"}}}' "$TARGET_MONTH")
printf 'header = "Authorization: Bearer %s"\n' "$CRUISE_API_KEY" | \
  curl -s -m 5 -K - -X POST "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/mcp" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d "$body_model"
```

## 3. Present the Spend Breakdown

Format the output clearly:

### Summary Header
- **Project**: `<project>`
- **Billing Month**: `<month>`
- **Total Charges**: `$<total_usd>`

If total spend is `$0.0000` or no rows are returned, display:
`No billed requests recorded in the Cruise ledger for this project in <month>.`

Otherwise, present two structured tables:

### Breakdown by Lane
Shows spend allocated across task lanes (e.g. `bb/agentic-coding`, `bb/chat-assistant`, `general`):

| Lane | Requests | Tokens | Charged (USD) | Share (%) |
|---|---|---|---|---|
| `<lane-id>` | `<count>` | `<tokens>` | `$<charged_usd>` | `<percentage>%` |

### Breakdown by Model
Shows spend allocated across serving models (e.g. `anthropic/claude-sonnet-5`, `deepseek/deepseek-flash`, `mistral/codestral-2508`):

| Model | Requests | Tokens | Charged (USD) | Share (%) |
|---|---|---|---|---|
| `<model-id>` | `<count>` | `<tokens>` | `$<charged_usd>` | `<percentage>%` |

## 4. Handle Errors & Refusals Gracefully

| Condition / Error | Explanation | What to do |
|---|---|---|
| `budget_exhausted` | The project's hard cap was exhausted during this period. | Check current status with `/cruise:status`. Wait for budget period rollover or ask project owner to raise cap. |
| `wallet_exhausted` | The account wallet balance is zero or exhausted. | Check wallet balance with `/cruise:status`. Top up wallet credits to resume traffic. |
| Invalid `month` | The month format could not be parsed. | Specify the month as `YYYY-MM` (e.g. `/cruise:spend 2026-09`). |
| Missing / Unset Key | `CRUISE_API_KEY` is not present in the environment. | Set `CRUISE_API_KEY` in your shell (e.g. `~/.zshrc`), restart Claude Code, and run `/cruise:spend` again. |
