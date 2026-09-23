# Security

## Reporting a vulnerability

Email **security@bytesbrains.com** with what you found and how to reproduce it. Please do not
open a public issue for a credential leak, an auth bypass, or anything that would let someone
else spend against a Cruise project.

We will acknowledge receipt and say what we are doing about it.

## What this plugin holds

- **No key.** The MCP server config and the status line read `CRUISE_API_KEY` from the
  environment at run time. `/cruise:setup` routes Claude Code through Cruise with an
  `apiKeyHelper` that also reads the environment, so the key never enters a settings file.
- **The status line** checks that the key uses only the characters a Cruise key has before it
  builds a request with it. It caches the answer for a minute, per key and base URL, in `$TMPDIR`.
- **Traffic** goes only to the configured `CRUISE_BASE_URL`: production by default, or the demo
  host.

If a key may have been exposed, revoke it in Cruise and issue a new one. A machine that held
the key exposes that one key and nothing more. That key's own budget and rate limits still
apply, if it was issued with them.

## Secrets in this repository

None should exist. `.gitignore` excludes `.env` and key files. The pre-commit and pre-push hooks
and CI run [gitleaks](https://github.com/gitleaks/gitleaks), including a rule for Cruise key
shapes (`cru_live_…`, `cru_demo_…` and the other prefixes). `test/plugin.test.ts` also fails if
any file in the repo contains something shaped like a key. Keep GitHub secret scanning and push
protection turned on for this repo.
