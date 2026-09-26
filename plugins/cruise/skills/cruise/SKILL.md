---
name: cruise
description: Use when work goes through BytesBrains Cruise — choosing a model or lane, checking what is left in the budget or what a month cost, or explaining a Cruise refusal such as budget_exhausted, wallet_exhausted or measurement_stale.
---

# Working through BytesBrains Cruise

Cruise is the gateway this project's model requests go through. It holds the provider keys,
enforces a budget per project and a prepaid wallet per account, and records every request in
a cost ledger. The `cruise` MCP server in this plugin reads the key's own project; it never
changes anything.

## Choosing what to call

- **A lane** is a model id that names a job — `bb/agentic-coding`, `bb/chat-assistant`,
  `bb/code-review`, `bb/summarization`, `bb/extraction`, `bb/translation`,
  `bb/deep-reasoning`, `bb/code-completion`. Cruise picks a member model per request, usually
  the cheapest that fits. Prefer a lane when the job matters more than the model.
- **A pinned model** (`provider/model`, e.g. `deepseek/deepseek-v4-flash`) when one specific
  model is required.
- Call the `list_models` tool (optionally `kind: "lanes"`) for what this key can actually reach,
  with each lane's job, description, members and prices. Use ids exactly as it returns them.

## Knowing what is left

- `get_budget` — the project's spend in its current period against its caps, and the account's
  wallet. **`action` is what the next request gets**: `serve` or `refuse`.
- `get_spend` — what a month cost, by model or by lane.

Every Cruise response also says where things stand in headers: `x-cruise-model` (who answered),
`x-cruise-lane`, `x-cruise-selection` (policy that chose), `x-cruise-affinity` (`new`, `pinned`, or `rebound`),
`x-cruise-budget-state` / `-spend` / `-limit`, `x-cruise-wallet-state` / `-balance`, and `x-cruise-cache`.

Cruise also supports gateway request headers for session affinity and attribution:
- `x-cruise-class`: tags the request traffic class (`agentic`, `interactive`, `scheduled`) in the Cruise ledger.
- `x-cruise-session`: pins lane member allocation for an agent run (1–128 characters of `[A-Za-z0-9._:-]`, 1-hour sliding TTL), keeping the same member model across multi-turn interactions so upstream prompt caching remains effective.


## Reading a refusal

Branch on `error.code`, never on the status — several are 429s that mean different things.

| Code | Means | What to do |
|---|---|---|
| `budget_exhausted` | The project's cap for this period is spent. Carries `retry-after` | Wait for the period to reset, or ask the project owner to raise the cap |
| `wallet_exhausted` | The account has no credit left. **No** `retry-after`: waiting does not help | A top-up or a credit grant; say so plainly rather than retrying |
| `measurement_stale` | The model's measurement aged out, so Cruise will not route it | Use a lane, or another model from `list_models` |
| `model_not_found` | No such model or lane, or nothing in the lane this key may reach | Check the id against `list_models` |
| `permission_error` (403) | The key is not scoped for that model | Pick a model the key reaches, or ask for a wider key |

## Never

- Never print, echo or write the Cruise key (`cru_…`). It lives in the `CRUISE_API_KEY`
  environment variable and nowhere else.
- Never suggest retrying a `wallet_exhausted` refusal in a loop.
