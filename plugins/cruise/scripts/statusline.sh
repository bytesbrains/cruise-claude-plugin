#!/bin/sh
# BytesBrains Cruise status line: this key's project spend for the current
# budget period, from Cruise's MCP server (`get_budget`).
#
# Claude Code runs a status line on every session event (debounced 300ms), so
# the answer is cached for 60 seconds per user: a status line must not turn
# every keystroke into a request. Failures are cached too, for the same reason.
#
# The key is read from CRUISE_API_KEY and handed to curl on stdin (`-K -`), so
# it never appears in the process list. Nothing is written but the cache,
# which holds the displayed line, never the key.

cat >/dev/null 2>&1 # Claude Code's session JSON; this line does not need it.

if [ -z "${CRUISE_API_KEY:-}" ]; then
  printf 'Cruise: set CRUISE_API_KEY\n'
  exit 0
fi

# The key is written into a curl config line below, where a `"` or a newline
# would end the header and start an option of the key's choosing. A Cruise key
# is letters, digits and underscores, so anything else is refused rather than
# escaped (#396 review). Passing it as `-H` instead would put it in `ps`.
case "$CRUISE_API_KEY" in
  *[!A-Za-z0-9_-]*)
    printf 'Cruise: CRUISE_API_KEY is not a Cruise key\n'
    exit 0
    ;;
esac

base="${CRUISE_BASE_URL:-https://cruise.bytesbrains.net}"
# One cache per key and base URL, so switching either (the demo and production,
# say) is not answered for a minute with the other's line (#396 review). The
# key reaches cksum on stdin, and 32 bits of CRC say nothing useful about it.
fingerprint=$(printf '%s\n%s' "$base" "$CRUISE_API_KEY" | cksum | cut -d' ' -f1)
cache="${TMPDIR:-/tmp}/cruise-statusline-$(id -u)-$fingerprint"
now=$(date +%s)

if [ -f "$cache" ]; then
  stamp=$(sed -n 1p "$cache")
  if [ -n "$stamp" ] && [ $((now - stamp)) -lt 60 ]; then
    sed -n 2p "$cache"
    exit 0
  fi
fi

body='{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_budget","arguments":{}}}'
reply=$(printf 'header = "Authorization: Bearer %s"\n' "$CRUISE_API_KEY" |
  curl -s -m 3 -K - -X POST "$base/mcp" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d "$body" 2>/dev/null)

# The structured result is compact JSON from a server we control. The budget
# and the wallet both carry `spend_usd` and `action`, and sed's `.*` is
# greedy — a pattern over the whole reply matches the *last* occurrence, which
# is the wallet's. So the budget object is cut out first, and every field is
# read from inside it. Caught by the plugin's own test, which printed the
# wallet's spend as the budget's.
project=$(printf '%s' "$reply" | sed -n 's/.*"structuredContent":{"project":"\([^"]*\)".*/\1/p' | head -1)
budget=$(printf '%s' "$reply" | sed -n 's/.*"structuredContent":{[^{]*"budget":{\([^}]*\)}.*/\1/p' | head -1)
field() { printf '%s' "$budget" | sed -n "s/.*\"$1\":\"\\([^\"]*\\)\".*/\\1/p" | head -1; }
spend=$(field spend_usd)
hard=$(field hard_usd)
action=$(field action)
period=$(field period)

if [ -n "$project" ] && [ -n "$spend" ]; then
  cap=${hard:-uncapped}
  [ -n "$hard" ] && cap="\$$hard"
  line="Cruise $project · \$$spend of $cap this ${period:-period} · ${action:-?}"
else
  line="Cruise: no answer from $base"
fi

umask 077
printf '%s\n%s\n' "$now" "$line" >"$cache" 2>/dev/null
printf '%s\n' "$line"
