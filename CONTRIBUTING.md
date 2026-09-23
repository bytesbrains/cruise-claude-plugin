# Contributing

Thanks for caring about the plugin. This repo is the source of truth for the `cruise` plugin
for Claude Code and the `bytesbrains` marketplace that serves it. It used to be copied here
from BytesBrains Cruise on each release; now all development happens here.

## Ground rules

- **Never commit a Cruise key.** The plugin reads `CRUISE_API_KEY` from the environment at run
  time and never writes it anywhere: not to a settings file, not to the MCP config, not to the
  status line's cache.
- **No telemetry, no second host.** The plugin reaches only the Cruise base URL the user
  configures.
- **`/cruise:setup` asks before it changes a file.** It stays `disable-model-invocation: true`,
  so only the user can start it.
- **Every change is a pull request into `main`**, one concern each.

## Setup

```sh
git clone https://github.com/bytesbrains/cruise-claude-plugin.git
cd cruise-claude-plugin
npm ci
```

`npm ci` runs `prepare`, which points `core.hooksPath` at `.githooks/`. **pre-commit** runs
`gitleaks protect` on the staged diff, and **pre-push** runs `gitleaks detect` over the full
history. Both use `.gitleaks.toml`, which includes the Cruise key shapes. The hooks need
[gitleaks](https://github.com/gitleaks/gitleaks) (`brew install gitleaks`) and fail if it is
missing. That is on purpose.

## Checks

```sh
npm run typecheck
npm test
npm run validate       # needs the `claude` CLI on PATH
npm run pack:check     # the npm tarball; needs gitleaks and the `claude` CLI
npm run secrets:scan
```

CI runs the same checks on every pull request and on every push to `main`. The required status
check is named `check`. `test/plugin.test.ts` holds the plugin's contract. It checks that:

- the manifest and the marketplace agree;
- the MCP config reads the key from the environment and never carries one;
- no file carries a Cruise key;
- every skill says when it applies;
- the status line prints what Cruise's answer says, and caches it per key.

## Trying a local build

```
/plugin marketplace add ./path/to/cruise-claude-plugin
/plugin install cruise@bytesbrains
```

For a key that costs nothing, use `export CRUISE_BASE_URL=https://cruise-demo.bytesbrains.net`
with a `cru_demo_` key.

## The icons

`assets/cruise-logo.svg` (the colour lockup the README shows) and `assets/cruise-mark.svg` (the
single-colour mark, drawn in `currentColor`) are copies of `assets/` in the BytesBrains site,
which is where they are drawn. Change them there first, then copy them here unmodified. They
are BytesBrains marks, not Apache-2.0 code (see `NOTICE`). Claude Code's plugin and marketplace
manifests have no icon field, so the README is the only place this repo shows them.

`assets/social-preview.png` (1280×640) is the card GitHub shows when this repo is linked. It is
the colour logo on the site's paper background (`#fbfcfd`), set in Inter and JetBrains Mono. No
API can set it, so after changing the file, upload it by hand: **Settings → General → Social
preview → Edit → Upload an image**.

## Releasing (maintainers)

A release is a **tag** that a person cuts. The tag does two things. The marketplace serves this
repository, and Claude Code decides whether an update exists from the plugin's `version`. The
tag also runs `.github/workflows/release.yml`, which publishes `plugins/cruise` to npm as
`@bytesbrains/claude-code-cruise`.

1. In the pull request that makes the change, bump `version` in
   `plugins/cruise/.claude-plugin/plugin.json`, and match it in `plugins/cruise/package.json`
   and the root `package.json`. The tests check that all three agree. Keep `version` out of
   `marketplace.json`.
2. Merge it once `check` is green.
3. Tag that commit on `main` and push the tag:

```sh
git fetch origin
git tag v0.x.y origin/main
git push origin v0.x.y
```

The workflow refuses a tag that doesn't match all three versions (`v0.1.3` ↔ `"0.1.3"`), or
that isn't on `main`. It runs the checks, packs the tarball, and runs `pack:check` on that exact
tarball:

- the tarball holds only the plugin's files;
- the status line is still executable;
- nothing in it is shaped like a key, and gitleaks agrees;
- `claude plugin validate` accepts it as a plugin.

Then it publishes that tarball with provenance. A bad release is fixed by the next version,
never by moving a tag or unpublishing.

To retry a publish that failed, without retagging: **Actions → release → Run workflow**, choose
the existing tag, and set `dry_run` to false. On a branch, the same run only packs and checks.

### npm setup (once)

- **The package is the plugin directory.** A marketplace's npm source unpacks the package as the
  plugin root, so the package is `plugins/cruise`. The repo root is `private` and never
  publishes.
- **Publishing uses npm trusted publishing (OIDC), not a stored token.** On npmjs.com, open
  `@bytesbrains/claude-code-cruise` → **Settings → Trusted publishing**. Add GitHub Actions with
  owner `bytesbrains`, repository `cruise-claude-plugin` and workflow `release.yml`.
- **The first publish needs a token.** npm can only configure trusted publishing on a package
  that already exists. Add a granular npm token for the `@bytesbrains` scope as the repository
  secret `NPM_TOKEN`, cut the tag, then set up trusted publishing. After that, delete the
  secret: with it gone, the workflow uses OIDC.
