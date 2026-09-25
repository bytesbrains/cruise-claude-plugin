---
description: List reachable Cruise models and lanes with pricing, capabilities, and active selection
---

# Cruise Models & Lanes

Query and list all models and lanes that the current Cruise API key can reach.

## 1. Retrieve Models

Call the `cruise` MCP server's `list_models` tool.
If the MCP server is not answering or unconfigured, query the models endpoint directly:

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

printf 'header = "Authorization: Bearer %s"\n' "$CRUISE_API_KEY" | \
  curl -s -m 5 -K - "${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}/v1/models"
```

## 2. Present the Catalogue

Organise the output into two tables:

### Lanes (Task-Oriented)
Lanes allocate a member model dynamically according to the lane's selection policy (e.g. cheapest member passing all gates).

| Lane ID | Job | Selection | Pricing (In / Out / Cache per Mtok) | Members |
|---|---|---|---|---|
| `bb/...` | *Summary of job* | `cheap`, `graduated`, etc. | `$X.XX / $Y.YY / $Z.ZZ` | `member1`, `member2`, ... |

### Pinned Models (Direct Provider Routing)
When a specific concrete model is required.

Group models by provider family (Anthropic, DeepSeek, Google, Mistral, Workers AI, etc.) showing:
- Model ID (e.g. `anthropic/claude-sonnet-5`, `deepseek/deepseek-flash`)
- Context Window
- Pricing per million tokens (input / output / cached)

## 3. Active Configuration

Check the current active model in Claude Code:
- Look up `env.ANTHROPIC_MODEL` in `~/.claude/settings.json` (or the `ANTHROPIC_MODEL` environment variable).
- Clearly highlight whether Claude Code is currently configured with a lane (e.g. `bb/agentic-coding`) or a pinned model.
- Inform the user that they can switch models with `/cruise:switch <model-or-lane>` or by updating `ANTHROPIC_MODEL` in `~/.claude/settings.json`.
