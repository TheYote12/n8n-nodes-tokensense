# Sprint 3 — Publish hygiene + maintenance workflow

**Date:** 2026-04-20
**Package:** `n8n-nodes-tokensense`
**Registry:** https://www.npmjs.com/package/n8n-nodes-tokensense
**Final state:** `0.1.0-beta.2` on both `latest` and `beta` dist-tags; `0.1.0-beta.1` deprecated with supersession message.

## Summary

First publish of the n8n community node shipped in this sprint. The publish mechanism had to work around a strict npm 2FA policy on the owning account (`tfa: auth-and-writes`, which requires OTP on every write), so all writes were routed through GitHub Actions using an automation-scoped `NPM_TOKEN`. Post-publish audit of the tarball surfaced two hygiene issues on `0.1.0-beta.1`; both were fixed in `0.1.0-beta.2`. A general-purpose maintenance workflow was added so future `npm deprecate` / `dist-tag` ops run from CI without OTP round-trips.

## Publish pipeline

### `.github/workflows/publish.yml` (hardened, PR #8 → commit `e4763bb`)

Changes vs. the original scaffold:

- Added `workflow_dispatch` trigger with a `dist_tag_override` string input for manual runs.
- New "Determine dist-tag" step parses `package.json` version:
  - Override wins if present.
  - Semver with no pre-release identifier (`/^\d+\.\d+\.\d+$/`) → `latest`.
  - Pre-release (`0.1.0-beta.2`, `0.1.0-rc.1`, …) → identifier extracted via
    `sed -E 's/^[0-9]+\.[0-9]+\.[0-9]+-([a-zA-Z]+).*$/\1/'` (defaults to `beta`).
- Final publish step passes `--tag ${{ steps.disttag.outputs.tag }}` so pre-releases never land on `latest`.
- Retains `--provenance` with `permissions: id-token: write` for sigstore attestations.
- `Publish summary` step writes package/version/tag/provenance status to `$GITHUB_STEP_SUMMARY`.

**Why it matters:** the original workflow would have silently published any pre-release to `latest` (npm's default dist-tag on first publish), shipping unstable code to every `npm install n8n-nodes-tokensense` user. The autodetect collapses the safe-default logic into CI so Carlo never has to reason about dist-tags at publish time.

### `.github/workflows/maintenance.yml` (new, PR #10 → commit `c39a3e0`)

`workflow_dispatch`-only, 92 lines, supports four operations via `choice` input:

| operation      | inputs (beyond `operation`) | npm command                                        |
|----------------|-----------------------------|----------------------------------------------------|
| `deprecate`    | `version`, `message_or_tag` | `npm deprecate "$PKG@$VERSION" "$MESSAGE"`         |
| `undeprecate`  | `version`                   | `npm deprecate "$PKG@$VERSION" ""`                 |
| `dist-tag-add` | `version`, `message_or_tag` (= tag name) | `npm dist-tag add "$PKG@$VERSION" "$TAG"` |
| `dist-tag-rm`  | `message_or_tag` (= tag name) | `npm dist-tag rm "$PKG" "$TAG"`                  |

Auth via `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` (automation-scoped, bypasses 2FA by design). Post-op state (`npm dist-tag ls`) is written to `$GITHUB_STEP_SUMMARY`.

Invocation pattern:
```bash
gh workflow run maintenance.yml \
  -f operation=deprecate \
  -f version=0.1.0-beta.1 \
  -f message_or_tag="Superseded by 0.1.0-beta.2 — package hygiene fixes."
```

## Tarball hygiene audit (against `0.1.0-beta.1`)

Ran `npm pack --dry-run`, `tar -tzf`, and a source-map inspection against the published tarball. Two issues found, both shipped in `0.1.0-beta.2` (PR #9 → commit `5013730`).

### 1. Personal Gmail in `author.email` — **critical**

`package.json` had:
```json
"author": { "name": "TheYote12", "email": "carlobpersonal@gmail.com", "url": "https://github.com/TheYote12" }
```
This renders on the public npm package page and is trivially scraped. Fixed to:
```json
"author": { "name": "TokenSense", "email": "TheYote12@users.noreply.github.com", "url": "https://github.com/TheYote12" }
```

**Note for stable `0.1.0`:** `carlo@tokensense.io` is already a verified email on the npm account and is a better long-term author email than the GitHub noreply form — swap it in on the pre-stable chore commit.

### 2. Internal CI scaffolding text in `README.md` — minor

README contained a `## Publishing (maintainer note)` section that described the internal publish workflow (GitHub Actions, NPM_TOKEN handling, etc.). Not secret, but shipped to end users who don't need it. Removed in the same PR:
```js
const before = md.indexOf("## Publishing (maintainer note)");
const after  = md.indexOf("## License", before);
fs.writeFileSync("README.md", md.slice(0, before) + md.slice(after));
```

### Things checked and passed

- **No secrets in tarball:** no `.env`, `.npmrc`, `NPM_TOKEN`, `STRIPE_*`, `SUPABASE_*`, or credentials-like strings in `dist/` or files list.
- **`files` field scoping:** `package.json#files` limits tarball to `dist/`, `README.md`, `LICENSE` — `test/`, `future/`, `node_modules/`, `jest.config.js`, and TS source trees are not included.
- **Source map hygiene:** `dist/**/*.js.map` have `sourcesContent: absent`, so original TypeScript source is not embedded in published maps.
- **Provenance attestation:** both beta.1 and beta.2 carry sigstore/OIDC provenance.
- **License:** MIT, `LICENSE` file present in tarball.

## Incident log (publish pipeline friction)

| Symptom                                  | Root cause                                                      | Resolution                                        |
|-----------------------------------------|-----------------------------------------------------------------|--------------------------------------------------|
| `ENEEDAUTH` on local `npm publish`      | No `~/.npmrc`, no `NPM_TOKEN` env var                           | Superseded — all publishes now run in CI.        |
| DC shell died mid-publish               | MCP 60s per-call timeout killed long `npm publish`              | N/A — moved to CI. Pattern for locally-run long jobs: `nohup … & disown` + tail log. |
| `EOTP` on `npm publish` from DC         | Account has `tfa: auth-and-writes` — every write needs an OTP   | Publish via GitHub Actions with `NPM_TOKEN` (automation scope bypasses 2FA). |
| `EOTP` on `npm deprecate` from DC       | Same 2FA policy                                                 | Built `maintenance.yml`; deprecate runs in CI.   |
| `gh run watch` hung DC shells           | Long-running watch commands exceed MCP shell timeout            | Poll pattern: `gh run view <id> --json status,conclusion` + `sleep 5` loop. |
| First publish seeded `latest` → beta.1  | npm auto-seeds `latest` on first publish regardless of `--tag`  | Moved with maintenance workflow: `dist-tag add @0.1.0-beta.2 latest`. |

## Final registry state (verified 2026-04-20)

```
$ npm view n8n-nodes-tokensense versions
[ '0.1.0-beta.1', '0.1.0-beta.2' ]

$ npm view n8n-nodes-tokensense dist-tags --json
{ "latest": "0.1.0-beta.2", "beta": "0.1.0-beta.2" }

$ npm view n8n-nodes-tokensense@0.1.0-beta.1 deprecated
"Superseded by 0.1.0-beta.2 — package hygiene fixes. Please use 0.1.0-beta.2."

$ npm view n8n-nodes-tokensense@0.1.0-beta.2 deprecated
(none)

$ npm view n8n-nodes-tokensense@0.1.0-beta.2 author
TokenSense <TheYote12@users.noreply.github.com>
```

## Follow-ups

1. **Scanner checkpoints** against `0.1.0-beta.2` — `@n8n/scan-community-package`:
   - `T+10min` (2026-04-20 07:30Z)
   - `T+1h`   (2026-04-20 08:20Z)
   - `T+24h`  (2026-04-21 07:20Z)
2. **24–48h beta soak** on `0.1.0-beta.2`. Stable `0.1.0` publish after soak.
3. **Stable `0.1.0` chore:** bump author.email to `carlo@tokensense.io`, bump version, run `publish.yml` (autodetect → `latest`).
4. **Trusted Publishers (OIDC) migration** in the `v0.2.0` chore — replaces the long-lived `NPM_TOKEN` secret with per-run OIDC exchange. Eliminates token rotation as a maintenance cost.
5. **`scripts/verify-package.sh`** — optional codification of the tarball audit (email regex, README section check, `sourcesContent` check, `files` field drift guard) as a pre-publish CI step. Would fail the publish job before the registry write.

## Artifacts

- PR #8 — `publish.yml` dist-tag autodetect (merged, `e4763bb`)
- PR #9 — package hygiene for beta.2 (merged, `5013730`)
- PR #10 — maintenance workflow (merged, `c39a3e0`)
- Maintenance runs: `24654631959` (deprecate beta.1), `24654635448` (dist-tag-add latest → beta.2) — both success.
