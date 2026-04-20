# Sprint 3 Handoff — `n8n-nodes-tokensense` beta + stable publish

> **Date:** 2026-04-20
> **Branch:** `claude/npm-publish-v0.1.0`
> **HEAD:** `5ae8898` (version-bumped to `0.1.0-beta.1`)
> **Authoritative plan:** `docs/plans/npm-publish-final-2026-04-19-v7.md`

This document hands off to Carlo for the manual `npm publish` step. Claude Code has completed everything through beta-ready and **has NOT published**. All publishing is manual from here.

---

## 1. Summary of what shipped (Sprints 1–3)

### Sprint 0 — feasibility gates (2026-04-19)

All gates passed. Full record in `docs/audits/sprint-0-feasibility-2026-04-19.md`.

| Gate | Outcome |
|------|---------|
| 0.1 Bearer auth vs prod proxy | PASS (HTTP 200) |
| 0.2 `metadata` reaches TokenSense logs | PASS |
| 0.3 Clean-install n8n resolves `@n8n/ai-node-sdk` | PASS — n8n@2.16.1 bundles SDK 0.7.0, `supplyModel` is a function |
| 0.5 `additionalParams` → HTTP body mapping present | PASS |
| 0.6 Node-version decision | Node 22 (n8n@2.16.1 declares `engines.node >=22.16`) |

### Sprint 1 — tooling foundation

Single commit `9d9001c` (landed before this Sprint 2 branch). Changes:

- `@n8n/node-cli@^0.23.0` installed; Path A (scaffold adopted) per Sprint 1.2 compat check
- Flat ESLint 9 config with `@n8n/eslint-plugin-community-nodes@0.10.0` + `eslint-plugin-n8n-nodes-base@^1.16.2`
- `jest@^29.7.0` + `ts-jest`; `jest.config.js` excludes `future/`
- `tsconfig.json` excludes `future/`, `test/`
- CI workflow on Node 22 (`.github/workflows/ci.yml`)
- Publish workflow (`.github/workflows/publish.yml`) with beta-tag routing

### Sprint 2 — scanner-clean refactor

| SHA | Commit |
|-----|--------|
| `1f130aa` | Relocate embeddings to `future/` (deferred to v0.2.0) |
| `482bce9` | Add `authenticate` block + bare-origin regex to `TokenSenseApi` credential |
| `31990d9` | `normalizeBaseUrl` helper + tests |
| `b14b0d6` | Migrate `TokenSenseChatModel` to `@n8n/ai-node-sdk` `supplyModel` + `additionalParams.metadata` |
| `58f873c` | Migrate `TokenSenseAi` + `loadModels` to `httpRequestWithAuthentication`; replace `form-data` with n8n native multipart; assert `.body` contract |
| `3cb6187` | Finalise `package.json` — `dependencies: {}`, peer range `>=0.7.0 <0.9.0`, `engines.node >=22.16`, no `main`, no `@langchain/openai`, no `form-data`, no `langsmith` override |

### Sprint 3 — pack + scanner + version bump

| SHA | Commit |
|-----|--------|
| `5ae8898` | Bump version to `0.1.0-beta.1` for beta publish |

---

## 2. Pre-publish checklist

| Check | Status | Evidence |
|-------|:--:|---|
| `npm run lint` | PASS | 0 errors, 1 intentional warning (`resource-operation-pattern` — accepted; v0.2.0 will introduce resources) |
| `npm run build` | PASS | `dist/` produced cleanly via `n8n-node build` |
| `npm test` | PASS | 58/58 Jest tests pass across 4 suites |
| `npm pack --dry-run` surface | PASS | 17 files, 17,588 bytes packed, 89,025 bytes unpacked (<100 KB) |
| Required files present | PASS | `package.json`, `LICENSE`, `README.md`, `dist/nodes/TokenSenseAi/TokenSenseAi.node.js`, `dist/nodes/TokenSenseChatModel/TokenSenseChatModel.node.js`, `dist/credentials/TokenSenseApi.credentials.js`, `dist/icons/tokensense.svg`, `icons/tokensense.svg` |
| Forbidden files absent | PASS | No `node_modules/`, `.github/`, `docs/`, `test/`, `nodes/` source, `credentials/` source, `shared/` source, `future/`, `*.test.ts`, `eslint.config.mjs`, `jest.config.js`, `tsconfig.json`, `dist/index.js` |
| `package.json` has no `main` | PASS | Removed in Sprint 2 (correction #5) |
| `dependencies: {}` | PASS | zero runtime deps |
| `peerDependencies.@n8n/ai-node-sdk` | PASS | `">=0.7.0 <0.9.0"` |
| `peerDependencies.n8n-workflow` | PASS | `">=2.13.0 <3.0.0"` |
| `engines.node` | PASS | `">=22.16"` matches n8n@2.16.1 |
| `keywords` includes `n8n-community-node-package` | PASS | confirmed in packed `package.json` |
| `n8n.nodes[]` has 2 entries (embeddings removed) | PASS | `TokenSenseAi`, `TokenSenseChatModel` |
| `n8n.credentials[]` has 1 entry | PASS | `TokenSenseApi` |
| Scanner against local `.tgz` | N/A — scanner requires published package; beta-first flow triggered (v7 §3.5 decision matrix row 3) |
| Package name availability on npm | Pending — Carlo to run `npm view n8n-nodes-tokensense` before publishing (expect 404) |

---

## 3. Beta publish — command to run locally

Carlo runs these from the repo root on branch `claude/npm-publish-v0.1.0` at HEAD `5ae8898`.

### 3.1 Pre-publish sanity

```bash
cd /Users/carlo/Documents/GitHub/n8n-nodes-tokensense
git status                         # expect clean
git rev-parse HEAD                 # expect 5ae8898...
node -v                            # expect >=22.16
npm whoami                         # expect your npm username
npm view n8n-nodes-tokensense      # expect E404 (not yet published)
```

### 3.2 Publish beta

```bash
npm publish --access public --tag beta
```

Notes:
- `--tag beta` is critical. Without it, `0.1.0-beta.1` would land on the `latest` dist-tag, and users running `npm install n8n-nodes-tokensense` would pull the beta.
- `--provenance` is currently omitted (Trusted Publishers migration is deferred to v0.2.0; publishing from a local machine with a classic NPM_TOKEN is the authorized path per v7).
- NPM_TOKEN is in GitHub repo secrets (Bypass-2FA granular token, set 2026-04-19) — but the **manual local publish** uses your logged-in `npm whoami` session, not the CI token.

### 3.3 Verification

Wait ~30–60 seconds for CDN propagation, then:

```bash
npm view n8n-nodes-tokensense@0.1.0-beta.1
npm view n8n-nodes-tokensense dist-tags
```

Expected from `dist-tags`:

```
{ beta: '0.1.0-beta.1' }
```

— note: no `latest` yet, which is correct for a pre-release.

---

## 4. 24–48 h beta soak — what to watch

1. **Install friction** — monitor GitHub Issues for any `npm ERR!` reports (`ERESOLVE`, peer-dep warnings, Node-version errors). Most likely candidates:
   - Users on Node <22.16 (expected — `engines.node` blocks with a clear error)
   - Users on n8n <2.13.0 (peer warning, not a failure)
2. **Scanner re-run after propagation** — roughly 10 min after publish, then again at 1 h and 24 h:
   ```bash
   npx @n8n/scan-community-package n8n-nodes-tokensense@0.1.0-beta.1
   ```
   Archive output to `docs/audits/sprint-3-scanner-2026-04-20.md`. Any finding → **do NOT promote to stable**; open a blocker doc, patch, republish as `0.1.0-beta.2`.
3. **Live smoke test against the published beta** — fresh n8n install, `Settings → Community Nodes → Install → n8n-nodes-tokensense@0.1.0-beta.1`. Verify:
   - Both nodes appear in the palette, icons render
   - AI Agent + `TokenSense Chat Model` sub-node completes a workflow; log row shows up in TokenSense Dashboard with `source`, `workflow_tag`, `project`, `provider`
   - `TokenSense AI` general node `chatCompletion` operation returns a completion + log row
4. **Community noise** — watch the n8n Discord `#community-nodes` channel and the GitHub repo Issues for mentions. Low volume expected for first 48 h.

**Any of the following triggers a hold on stable promotion:**
- Scanner finds anything
- Any user reports install failure that isn't a user-Node-version issue
- Any operation regression (missing metadata, wrong response shape)

---

## 5. Stable publish — procedure

Only after the beta has soaked cleanly.

### 5.1 Version-only commit — same source tree

```bash
cd /Users/carlo/Documents/GitHub/n8n-nodes-tokensense
git checkout claude/npm-publish-v0.1.0     # or main if merged by then
git pull
npm version 0.1.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "release: v0.1.0"
git push
```

If the branch has been merged to `main`, run the above on `main` instead — the stable release should come from the merged source tree.

### 5.2 Publish stable (default `latest` tag)

```bash
npm publish --access public
```

Do NOT pass `--tag`. npm defaults to `latest`, which is what we want for the first stable.

### 5.3 Verify

```bash
npm view n8n-nodes-tokensense@0.1.0
npm view n8n-nodes-tokensense dist-tags
```

Expected:
```
{ latest: '0.1.0', beta: '0.1.0-beta.1' }
```

### 5.4 Git tag (optional, local only per handoff constraints)

This handoff does NOT push tags. If you want a Git tag for the release, create it locally and decide separately whether to push it to `origin`.

---

## 6. NPM_TOKEN rotation reminder

After the first successful publish (beta OR stable — whichever lands first):

- The current NPM_TOKEN is a 30-day granular Bypass-2FA token created 2026-04-19 04:33 UTC, so it expires ~2026-05-19.
- Once v0.1.0 stable is out, the **next** publish (e.g. v0.1.1) is the right moment to revisit credentials:
  - Either rotate to a fresh NPM_TOKEN with a shorter TTL, or
  - Migrate to npm Trusted Publishers (OIDC) — this is the v0.2.0 target per v7 plan §Carlo's Manual Steps.
- Until then, keep the token in `Settings → Secrets and variables → Actions → NPM_TOKEN` of the GitHub repo. Do not echo or commit the token value.

---

## 7. What Claude Code did NOT do (hard stops honored)

- Did not run `npm publish` (beta or stable).
- Did not push Git tags to `origin`.
- Did not read, print, or touch `NPM_TOKEN`.
- Did not modify the TokenSense monorepo at `/Users/carlo/Documents/GitHub/tokensense`.
- Did not auto-fix anything based on the scanner failure — the scanner's 404 against a local tarball is the expected `beta-first` trigger per v7 plan §3.5, not a blocker.
