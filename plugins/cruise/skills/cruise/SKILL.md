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

## Context Window & Auto-Compaction

Claude Code enforces a conservative 200k token context window by default for models not recognized
in its local catalog, triggering early auto-compaction and emitting warnings. When routing through Cruise:
- `CLAUDE_CODE_MAX_CONTEXT_TOKENS: "1000000"` sets Claude Code's auto-compact context window threshold
  to 1M tokens (the default for Cruise agentic coding and models like Grok 4.6 and Gemini), allowing
  full utilization of large-context models without premature compaction.
- `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "1"` disables local catalog window clamping
  and suppresses unknown model warnings for non-Anthropic models and Cruise lanes (`bb/*`, `grok/*`,
  `deepseek/*`, `google-ai-studio/*`).
- Switching to a model with a distinct context window in the Cruise catalogue (e.g. 2M for Gemini)
  dynamically updates `CLAUDE_CODE_MAX_CONTEXT_TOKENS` while preserving intentional user overrides.
- Picking a **1M context** option in Claude Code 2.1+'s `/model` appends `[1m]` to the id
  (`claude-opus-5-5[1m]`). Cruise does not know that suffix and answers `model_not_found`. Pick a
  Cruise lane or pinned model instead (`/cruise:switch bb/agentic-coding`); the 1M window already
  comes from `CLAUDE_CODE_MAX_CONTEXT_TOKENS`. Normalizing the suffix in the gateway is tracked
  upstream in bytesbrains-cruise.

## When a failing model locks you out

Slash commands, `/cruise:disconnect` included, run through the active model. If that model is
refused (`model_not_found`, `budget_exhausted`, `wallet_exhausted`), tell the user to quit Claude
Code and run `npx @bytesbrains/claude-code-cruise disable` (or `switch <model>`) in a terminal.
It edits `settings.json` offline and needs no model and no key.

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
