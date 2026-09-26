---
description: Inspect real-time Cruise project budget, caps, wallet balance, and serve/refuse status
---

# Cruise Project Budget & Gateway Status

Inspect real-time project budget limits, current period spend, tenant wallet balance, and whether the next model request will be served or refused.

## 1. Retrieve Budget & Status

Call the `cruise` MCP server's `get_budget` tool.
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

body='{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_budget","arguments":{}}}'
printf 'header = "Authorization: Bearer %s"\n' "$CRUISE_API_KEY" | \
  curl -s -m 5 -K - -X POST "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/mcp" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d "$body"
```

## 2. Present Budget & Wallet Information

Organise the output clearly with the following sections:

### Overview & Next Request Decision
- **Project**: Project ID or name (from `project`)
- **Next Request Action**:
  - `🟢 SERVE` — The next model request will be served normally.
  - `🔴 REFUSE` — The next model request will be refused by Cruise (see Refusals section below).

### Period Budget
Display current period spend vs soft and hard limit caps:
- **Budget Period**: `<period>` (e.g. `day`, `month`)
- **Current Period Spend**: `$<spend_usd>`
- **Soft Limit**: `$<soft_usd>` (spend alert threshold)
- **Hard Limit**: `$<hard_usd>` (or `Uncapped` if null/absent)
- **Remaining Cap**: `$<hard_usd - spend_usd>` (or `Unlimited` if uncapped)
- **State**: `<state>` (e.g. `ok`, `soft_exceeded`, `hard_exceeded`)

### Tenant Wallet
Display prepaid wallet funds:
- **Available Balance**: `$<balance_usd>`
- **Granted Credit**: `$<granted_usd>`
- **Lifetime Wallet Spend**: `$<spend_usd>`
- **State**: `<state>` (e.g. `ok`, `exhausted`)

## 3. Handle Refusals & Errors Gracefully

If the next request will be refused or an error response is received, explain the exact situation and the remediation steps:

| Status / Code | Cause | What to do |
|---|---|---|
| `budget_exhausted` (Budget `refuse`) | The project's hard limit for the current `<period>` has been spent. | Wait for the period to reset (daily budgets reset at 00:00 UTC), or ask the project admin to raise the hard limit. |
| `wallet_exhausted` (Wallet `refuse`) | The tenant wallet balance is empty ($0.00). **No automatic reset.** | A prepaid wallet top-up or credit grant is required. Waiting will not resolve this refusal. |
| `measurement_stale` | The model's latency/cost measurement has aged out. | Switch to an active lane (`/cruise:switch bb/agentic-coding`) or another model from `/cruise:models`. |
| `permission_error` (403) | The API key lacks permission for the project. | Verify your key or contact your organization administrator. |
| Missing / Unset Key | `CRUISE_API_KEY` is not present in the environment. | Set `CRUISE_API_KEY` in your shell (e.g. `~/.zshrc`), restart Claude Code, and run `/cruise:status` again. |
