# npm Publish — Final Plan (v2)

> **Status:** Drafted 2026-04-19, awaiting Carlo approval
> **Supersedes:** `docs/plans/npm-publish-final-2026-04-19.md` (v1, same date)
> **Target version:** `0.1.0`
> **Publish path:** NPM_TOKEN (Bypass-2FA granular token) for v0.1.0; Trusted Publishers migration documented for v0.2.0
> **Embeddings strategy:** Option A — relocate source to `future/`, defer registration to v0.2.0

---

## Why v2 exists

v1 was reviewed by ChatGPT (Chrome session, 2026-04-19, 114 sources). ChatGPT flagged 5 potential blockers and a polish list. I verified each against the actual codebase:

| # | ChatGPT concern | My verdict | Why |
|---|-----------------|-----------|-----|
| 1 | Proxy requires `x-tokensense-key`; `supplyModel()` sends `Authorization: Bearer` — auth mismatch blocks the simple pattern. | **Disagree.** | `Proxy/auth.js:5,27` explicitly accepts `Authorization: Bearer <key>`. ChatGPT didn't have proxy source access. Simple `OpenAiModel` + `supplyModel()` will auth cleanly. |
| 2 | `@n8n/ai-node-sdk` must be resolvable at runtime inside a clean n8n install — declaring it `peerDependency` only is risky. | **Agree.** | Community nodes run inside n8n's own `node_modules`. If n8n doesn't bundle `@n8n/ai-node-sdk` at the version we need, `supplyModel` import fails at load time. Must verify in Sprint 0 against `n8nio/n8n:latest` container. |
| 3 | Advanced `BaseChatModel` fallback pattern in v1 is open-ended — if the simple pattern fails we'll sink hours into a custom subclass. | **Agree.** | v1 lists "stream/abort/tools/serialization" — that's a full provider rewrite, not a fallback. v2 makes Sprint 0 a stop-go gate: if `supplyModel` can't carry our metadata, we stop and re-plan, not bolt on a half-baked custom model. |
| 4 | Keeping unregistered `TokenSenseEmbeddings` source inside tsconfig `include` still lets restricted imports poison lint + build. | **Agree.** | Source in tree ≠ code that compiles. v2 moves the file to `future/TokenSenseEmbeddings.node.ts`, outside `tsconfig.json` `include` and outside ESLint glob. |
| 5 | v1 offers both NPM_TOKEN and OIDC Trusted Publishing — pick one for v0.1.0 or the publish workflow is ambiguous. | **Agree.** | v0.1.0 uses NPM_TOKEN (already stored in repo secrets, verified 2026-04-19). Trusted Publishers path documented as a separate post-publish task for v0.2.0. |

Polish items I also agree with (folded into the sprints below):
- Adopt `@n8n/node-cli@^0.23.0` for `build / lint / dev / release` scripts — this is the official scaffold, bundles `@n8n/eslint-plugin-community-nodes`, and gives us `n8n-node release` which handles version bumping + tagging.
- Pin `@n8n/eslint-plugin-community-nodes` to an exact version (not `"latest"`) so CI is reproducible.
- Downgrade Jest 30 → 29.7 to match `ts-jest@29` (Jest 30 + ts-jest 29 has known peer-dep warnings and intermittent failures in n8n community packages).
- Tighten `n8n-workflow` peer from `">=1.0.0"` to `">=2.13.0 <3.0.0"` — matches what `@n8n/ai-node-sdk@0.4.x` expects.
- Add `normalizeBaseUrl()` helper — users pasting `https://api.tokensense.io/v1` produce `/v1/v1/chat/completions` under the simple `OpenAiModel` pattern. Strip a trailing `/v1` and trailing `/` before passing to `supplyModel`.
- Verify icon path after `npm pack` — `postbuild: cp -r icons dist/icons` runs, but the node descriptor references `icon: 'file:icons/tokensense.svg'` — confirm the packed tarball resolves correctly.
- Add a clean-install smoke test: `npm pack` → copy tarball into an `n8nio/n8n` Docker container → `npm install /tmp/n8n-nodes-tokensense-0.1.0.tgz` → launch n8n → confirm nodes register without error.

Cuts carried over from v1:
- Custom `BaseChatModel` subclass is **out** of v0.1.0 (stop-go gate in Sprint 0 instead).
- Jest 30 is **out** (downgrade to 29.7).
- Embeddings source **out of** `tsconfig.json` `include` (moved to `future/`).

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Sprint 0 — Feasibility Gate (pre-code)](#sprint-0--feasibility-gate-pre-code)
3. [Sprint 1 — Tooling Foundation](#sprint-1--tooling-foundation)
4. [Sprint 2 — Dependency Elimination](#sprint-2--dependency-elimination)
5. [Sprint 3 — Last Pass + Publish Prep](#sprint-3--last-pass--publish-prep)
6. [Carlo's Manual Steps](#carlos-manual-steps)
7. [Publish Procedure](#publish-procedure)
8. [Post-Publish](#post-publish)
9. [Open Risks](#open-risks)
10. [Success Criteria](#success-criteria)

---

## Executive Summary

Ship `n8n-nodes-tokensense@0.1.0` to npm, scanner-clean, with:
- `TokenSense Chat Model` sub-node (AI Agent `ai_languageModel` output, implemented via `supplyModel()` + `OpenAiModel`)
- `TokenSense AI` general node (8 operations, multipart via n8n built-in helper)
- `TokenSenseApi` credential (endpoint + API key with declarative test via `GET /v1/models`)

Defer to v0.2.0:
- `TokenSense Embeddings` sub-node (source moves to `future/`)
- OIDC Trusted Publishers migration
- Custom `BaseChatModel` subclass (only if Sprint 0 gate forces it)

**Four sprints, ~5-7 hours of Claude Code execution + ~30 min of Carlo manual setup (already mostly done).**

---

## Sprint 0 — Feasibility Gate (pre-code)

**Duration:** ~45 min
**Goal:** Prove the core assumptions before we touch production source. If any gate fails, we stop and replan rather than refactoring into a dead end.

### 0.1 Inspect `@n8n/ai-node-sdk` exports

```bash
cd /tmp && mkdir ts-feasibility && cd ts-feasibility
npm init -y
npm install @n8n/ai-node-sdk@^0.4.1
node -e "console.log(Object.keys(require('@n8n/ai-node-sdk')))"
cat node_modules/@n8n/ai-node-sdk/dist/index.d.ts | head -100
```

Confirm the following exports exist: `supplyModel`, `parseSSEStream`, `BaseChatModel`, `WindowedChatMemory`, `OpenAiModel` type.

### 0.2 Verify `supplyModel` / `OpenAiModel` supports every field we need

Read the SDK's type definitions for `OpenAiModel` and trace `supplyModel` → the actual LangChain construction. Confirm each of the following is a first-class field (NOT silently dropped):

- `baseUrl` (string, required)
- `apiKey` (string, required)
- `model` (string, required)
- `temperature` (number)
- `maxTokens` (number, optional)
- `streaming` (boolean, default true)
- `extraBody` or `modelKwargs` — this is the critical one. Our metadata must propagate into the HTTP request body so the TokenSense proxy can tag logs. If `extraBody` is not a supported field, stop and flag before Sprint 2.
- Tool binding (`tools` / `tool_choice` pass-through) — AI Agent node drives this; `supplyModel` + `ChatOpenAI` under the hood handles it by default, but confirm.

Record findings in `docs/plans/sprint-0-feasibility-findings.md`.

### 0.3 Confirm Bearer auth works against production

```bash
curl -sS -X POST https://api.tokensense.io/v1/chat/completions \
  -H "Authorization: Bearer $TS_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5-mini","messages":[{"role":"user","content":"ping"}],"max_tokens":10}'
```

Must return a 200 with a completion. This is the check that validates the reason v2 rejects ChatGPT blocker #1.

### 0.4 Clean-install smoke test from bare sdk

Spin up a throwaway `n8nio/n8n` container, install a stubbed package that imports `@n8n/ai-node-sdk`, and confirm the module resolves without errors:

```bash
docker run --rm -it -p 5678:5678 n8nio/n8n:latest /bin/sh -c "
  cd /home/node && npm install @n8n/ai-node-sdk@^0.4.1 && \
  node -e \"require('@n8n/ai-node-sdk').supplyModel && console.log('OK')\"
"
```

If resolution fails, `@n8n/ai-node-sdk` is not safely a `peerDependency` — we'll need to declare it as a regular `dependency`, which re-opens the scanner question. Stop and escalate.

### 0.5 Gate decision

| Result | Next action |
|--------|-------------|
| All four checks green | Proceed to Sprint 1. |
| 0.2 `extraBody` unsupported | Stop. Raise with Carlo. Options: (a) advocate a TokenSense-proxy-side `?metadata=` query-param fallback; (b) switch to custom `BaseChatModel` subclass and formally re-scope; (c) ship v0.1.0 without workflow-tagging metadata and add in v0.2.0. |
| 0.3 Bearer auth fails | Stop. v2 premise (ChatGPT blocker #1 rejection) is wrong; fall back to v1's `x-tokensense-key` plan. |
| 0.4 SDK unresolvable at runtime | Stop. Drop `peerDependency` approach; make `@n8n/ai-node-sdk` a regular dep and re-scan. |

**Commit:** `docs: add Sprint 0 feasibility findings` — no code changes.

---

## Sprint 1 — Tooling Foundation

**Duration:** ~60-90 min
**Goal:** Official n8n scaffold (`@n8n/node-cli`) drives build/lint/dev/release. ESLint 9 flat config with community-nodes rules. CI runs lint + build + test on every PR.

### 1.1 Install dev dependencies

```bash
npm install --save-dev \
  @n8n/node-cli@^0.23.0 \
  @n8n/eslint-plugin-community-nodes@<PIN_EXACT> \
  eslint-plugin-n8n-nodes-base@^1.16.2 \
  eslint@^9.0.0 \
  @typescript-eslint/parser@^8.0.0
```

**Pin the community-nodes plugin to an exact version.** Run `npm view @n8n/eslint-plugin-community-nodes versions --json | tail -1` first and pin to that exact value. "latest" in a devDependency makes CI non-reproducible.

Downgrade Jest to match ts-jest:

```bash
npm install --save-dev jest@^29.7.0 @types/jest@^29.5.0
```

### 1.2 Replace `package.json` scripts with `@n8n/node-cli`

```json
{
  "scripts": {
    "build": "n8n-node build",
    "dev": "n8n-node dev",
    "lint": "n8n-node lint",
    "lint:fix": "n8n-node lint --fix",
    "test": "jest",
    "release": "n8n-node release",
    "prepublishOnly": "npm run lint && npm run build && npm test"
  }
}
```

If `n8n-node build` doesn't handle the `postbuild: cp -r icons dist/icons` step, keep `postbuild` as a separate hook.

### 1.3 Create `eslint.config.mjs` (flat config, ESLint 9)

```javascript
import n8nCommunityNodes from '@n8n/eslint-plugin-community-nodes';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['nodes/**/*.ts', 'credentials/**/*.ts', 'shared/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@n8n/community-nodes': n8nCommunityNodes,
      'n8n-nodes-base': n8nNodesBase,
    },
    rules: {
      ...n8nCommunityNodes.configs.recommended.rules,
      ...n8nNodesBase.configs.nodes.rules,
    },
  },
  {
    files: ['credentials/**/*.ts'],
    rules: {
      ...n8nNodesBase.configs.credentials.rules,
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'test/**', 'docs/**', 'future/**'],
  },
];
```

**Note:** `future/**` is ignored — that's where `TokenSenseEmbeddings` will live.

### 1.4 Update `tsconfig.json` `include`/`exclude`

Explicitly exclude `future/` so the embeddings source compiles in v0.2.0 branches but not in v0.1.0 builds:

```json
{
  "include": ["nodes/**/*.ts", "credentials/**/*.ts", "shared/**/*.ts"],
  "exclude": ["node_modules", "dist", "test", "future"]
}
```

### 1.5 Update `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

### 1.6 Run `npm run lint` once, inventory violations

Expected hits in the **active** source (post-exclude):
- `no-restricted-imports`: `@langchain/openai` in `TokenSenseChatModel.node.ts:9`, `form-data` in `TokenSenseAi.node.ts:9`
- `no-restricted-globals`: `globalThis.fetch` is now gone (only lived in `TokenSenseEmbeddings`, which is moved to `future/`)
- Possibly: `credential-password-field`, `node-usable-as-tool`, description-formatting hits

**Commit structure:**
- `chore: adopt @n8n/node-cli scaffold (Sprint 1)`
- `chore: add flat ESLint 9 config with community-nodes rules`
- `chore: downgrade Jest to 29.7 for ts-jest compatibility`
- `chore: exclude future/ from tsconfig and lint`
- `ci: run lint + build + test on every PR`

Open PR `Sprint 1: tooling foundation` against `main`.

### Acceptance
- `npm run lint` runs without crashing (violations expected, that's Sprint 2)
- `npm run build` still passes (no `future/` compilation attempts)
- CI workflow green (once pushed with `workflow` PAT scope)

---

## Sprint 2 — Dependency Elimination

**Duration:** ~2-3 hours
**Goal:** Remove `@langchain/openai`, `form-data`, `langsmith` override. End state: `"dependencies": {}`.

### 2.1 Move embeddings out of scope

```bash
mkdir -p future
git mv nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts future/TokenSenseEmbeddings.node.ts
git rm -rf nodes/TokenSenseEmbeddings/
# Keep tests, but skip:
git mv test/TokenSenseEmbeddings.test.ts future/TokenSenseEmbeddings.test.ts
```

Remove the embeddings entry from `package.json` `n8n.nodes[]`:

```json
"n8n": {
  "n8nNodesApiVersion": 1,
  "nodes": [
    "dist/nodes/TokenSenseAi/TokenSenseAi.node.js",
    "dist/nodes/TokenSenseChatModel/TokenSenseChatModel.node.js"
  ],
  "credentials": [
    "dist/credentials/TokenSenseApi.credentials.js"
  ]
}
```

`future/` is already excluded from tsconfig + lint (Sprint 1). Nothing in `future/` gets packed because the npm `files` array is `["dist", "icons", "package.json", "LICENSE", "README.md"]` — `future/` isn't listed, so it's silently excluded from the published tarball.

### 2.2 Add `normalizeBaseUrl()` helper

**File:** `shared/utils.ts` (extend existing)

```typescript
export function normalizeBaseUrl(input: string): string {
  // Strip trailing slash, then strip trailing /v1 if present.
  // Users may paste "https://api.tokensense.io", "https://api.tokensense.io/",
  // or "https://api.tokensense.io/v1" — all must normalise to the bare origin.
  const trimmed = input.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/v1$/, '');
}
```

Unit tests (`test/utils.test.ts`):
- `normalizeBaseUrl('https://api.tokensense.io')` → `'https://api.tokensense.io'`
- `normalizeBaseUrl('https://api.tokensense.io/')` → `'https://api.tokensense.io'`
- `normalizeBaseUrl('https://api.tokensense.io/v1')` → `'https://api.tokensense.io'`
- `normalizeBaseUrl('https://api.tokensense.io/v1/')` → `'https://api.tokensense.io'`

### 2.3 Rewrite `TokenSenseChatModel` — simple pattern ONLY

Sprint 0 confirmed `supplyModel` + `extraBody` carries metadata. No BaseChatModel fallback in v0.1.0.

**File:** `nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts`

```typescript
import type {
  ILoadOptionsFunctions,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
  SupplyData,
} from 'n8n-workflow';
import { supplyModel } from '@n8n/ai-node-sdk';
import type { OpenAiModel } from '@n8n/ai-node-sdk';
import { buildMetadata, loadModels, normalizeBaseUrl } from '../../shared/utils';

// ... class body unchanged up to supplyData()

async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
  const credentials = await this.getCredentials('tokenSenseApi');
  const model = this.getNodeParameter('model', itemIndex) as string;
  const temperature = this.getNodeParameter('temperature', itemIndex) as number;
  const maxTokens = this.getNodeParameter('maxTokens', itemIndex, 0) as number;
  const streaming = this.getNodeParameter('streaming', itemIndex, true) as boolean;
  const metadata = buildMetadata(this, itemIndex);

  const origin = normalizeBaseUrl(credentials.endpoint as string);

  const modelConfig: OpenAiModel = {
    type: 'openai',
    model,
    baseUrl: `${origin}/v1`,
    apiKey: credentials.apiKey as string,
    temperature,
    streaming,
    ...(maxTokens > 0 ? { maxTokens } : {}),
    extraBody: { metadata },
  };

  return supplyModel(this, modelConfig);
}
```

**Acceptance:**
- No `@langchain/openai` import
- Node appears as `ai_languageModel` output in n8n
- Connected to AI Agent → full chat works end-to-end against production
- Metadata (`source=n8n`, `project`, `workflow_tag`, `provider`) arrives in TokenSense logs
- Streaming works (token-by-token render in AI Agent memory test)
- Tool calling works (test with a simple n8n workflow tool)
- Base URL normalisation covered by the test cases above

### 2.4 Replace `form-data` in `TokenSenseAi`

**File:** `nodes/TokenSenseAi/TokenSenseAi.node.ts` (lines 9, 652-665)

```typescript
// Remove line 9: import FormData from 'form-data';

// In transcribeAudio handler:
const response = await this.helpers.httpRequest({
  method: 'POST',
  url: `${normalizeBaseUrl(endpoint)}/v1/audio/transcriptions`,
  headers: { 'x-tokensense-key': apiKey },
  body: {
    file: {
      value: Buffer.from(binaryBuffer),
      options: { filename: fileName, contentType: mimeType },
    },
    model,
    response_format: responseFormat,
    ...(language ? { language } : {}),
    metadata: JSON.stringify(metadata),
  },
  contentType: 'multipart-form-data',
  returnFullResponse: true,
});
```

Fallback ladder if `contentType: 'multipart-form-data'` with nested file object doesn't work:
1. `this.helpers.httpRequestWithAuthentication` with the `request`-style `formData` option
2. Hand-build multipart boundary with `crypto.randomUUID()` + `Buffer.concat()`

### 2.5 Update `package.json` — zero runtime deps

```json
{
  "dependencies": {},
  "peerDependencies": {
    "n8n-workflow": ">=2.13.0 <3.0.0",
    "@n8n/ai-node-sdk": ">=0.4.1 <0.5.0"
  },
  "devDependencies": {
    "@n8n/ai-node-sdk": "0.4.1",
    "@n8n/node-cli": "^0.23.0",
    "@n8n/eslint-plugin-community-nodes": "<EXACT_PIN>",
    "@types/jest": "^29.5.0",
    "@types/node": "^20.19.37",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-n8n-nodes-base": "^1.16.2",
    "jest": "^29.7.0",
    "n8n-workflow": "^2.13.1",
    "ts-jest": "^29.4.9",
    "typescript": "^5.7.3"
  }
}
```

**Remove:**
- `dependencies.@langchain/openai`
- `dependencies.form-data`
- `overrides.langsmith`

### 2.6 Update Jest tests

- `TokenSenseChatModel`: mock `supplyModel` from `@n8n/ai-node-sdk`; assert the `modelConfig` passed in (baseUrl ends with `/v1` exactly once; apiKey set; `extraBody.metadata` matches).
- `TokenSenseAi`: update multipart assertions — confirm `this.helpers.httpRequest` called with `contentType: 'multipart-form-data'` and the correct nested body structure.
- Add `utils.test.ts` with the `normalizeBaseUrl` cases above.
- Remove/skip embeddings tests (already moved to `future/`).

**Acceptance:**
- `npm test` passes (~35-40 tests, embeddings tests gone)
- `npm run lint` exits 0 on active source
- No `@langchain/openai`, `form-data`, `langsmith` in any `package*.json`

### Sprint 2 Commit Structure

Single PR `Sprint 2: scanner-clean refactor`:
- `chore: relocate TokenSenseEmbeddings to future/ (deferred to v0.2.0)`
- `feat: add normalizeBaseUrl helper`
- `feat: migrate TokenSenseChatModel to @n8n/ai-node-sdk supplyModel pattern`
- `feat: replace form-data with n8n built-in multipart in TokenSenseAi`
- `chore: remove @langchain/openai, form-data, langsmith override`
- `test: update mocks for scanner-clean node implementations`
- `docs: update README with v0.1.0 embeddings story`

---

## Sprint 3 — Last Pass + Publish Prep

**Duration:** ~45-60 min
**Goal:** Green everywhere. Packed tarball validated in a clean n8n container. Ready to tag.

### 3.1 Green path

```bash
npm run lint    # must exit 0
npm run build   # clean TypeScript compile
npm test        # all remaining tests pass
npm pack --dry-run --json > /tmp/pack-report.json
```

### 3.2 Tarball content verification

Inspect `/tmp/pack-report.json`:
- `files` includes `dist/nodes/TokenSenseAi/TokenSenseAi.node.js`, `dist/nodes/TokenSenseChatModel/TokenSenseChatModel.node.js`, `dist/credentials/TokenSenseApi.credentials.js`, `dist/icons/tokensense.svg`, `package.json`, `LICENSE`, `README.md`.
- `files` does NOT include `node_modules/`, `.github/`, `docs/`, `test/`, `nodes/` source, `future/`.
- `size` < 100KB.

### 3.3 Icon resolution check

```bash
npm pack                                    # produces n8n-nodes-tokensense-0.1.0.tgz
tar -tzf n8n-nodes-tokensense-0.1.0.tgz | grep icons
# must show: package/dist/icons/tokensense.svg

# Confirm node descriptor references the packed path:
tar -xzf n8n-nodes-tokensense-0.1.0.tgz --to-stdout package/dist/nodes/TokenSenseAi/TokenSenseAi.node.js | grep -m1 "icon:"
# expected: icon: 'file:icons/tokensense.svg'
```

### 3.4 Clean-install smoke test (n8nio/n8n container)

```bash
docker run --rm -v "$PWD:/pkg" -p 5678:5678 n8nio/n8n:latest /bin/sh -c "
  cd /home/node &&
  npm install /pkg/n8n-nodes-tokensense-0.1.0.tgz &&
  n8n start
"
```

- Launch succeeds without errors
- n8n UI at `http://localhost:5678` loads
- Search the nodes panel for "TokenSense" — both `TokenSense AI` and `TokenSense Chat Model` appear
- Create a credential (endpoint + API key) → declarative test passes (calls `GET /v1/models`)
- Create an AI Agent workflow, attach TokenSense Chat Model, run — chat succeeds, logs appear in TokenSense dashboard with `source=n8n`, correct `project` and `workflow_tag`

### 3.5 Package name availability

```bash
npm view n8n-nodes-tokensense
# Expected: E404 — name is free
```

If taken, stop and discuss. Alternate: `@tokensense/n8n-nodes` (scoped).

### 3.6 README final polish

Confirm `README.md` covers:
- One-liner: what TokenSense is
- Install: "Settings → Community Nodes → install `n8n-nodes-tokensense`"
- Credential setup: endpoint (`https://api.tokensense.io`) + API key from app.tokensense.io/keys — note that endpoint with or without trailing `/v1` is auto-normalised
- Quick example: AI Agent workflow with TokenSense Chat Model sub-node
- Quick example: general TokenSense AI node (chat completion)
- Embeddings story for v0.1.0 (HTTP Request node, or TokenSense AI general node's Embeddings operation)
- Link to github.com/TheYote12/n8n-nodes-tokensense
- License (MIT)

### 3.7 Dry-run publish

```bash
npm whoami               # confirm logged in
npm publish --provenance --access public --dry-run
```

Confirm:
- Package name `n8n-nodes-tokensense`
- Version `0.1.0`
- Provenance enabled
- File list matches expectations

---

## Carlo's Manual Steps

Already complete as of 2026-04-19:

- ✅ GitHub PAT `carlo-ops-dashboard-v2` has `workflow` scope (confirmed 2026-04-19)
- ✅ npm Granular Access Token created with Bypass-2FA, 30-day expiry
- ✅ `NPM_TOKEN` added to GitHub repo secrets for `TheYote12/n8n-nodes-tokensense`

**Trusted Publishers migration — deferred to v0.2.0.** Documented as a separate post-publish task:
1. After v0.1.0 ships, npmjs.com → `n8n-nodes-tokensense` → package settings → Trusted Publishers
2. Add GitHub Actions trusted publisher for `TheYote12/n8n-nodes-tokensense`, workflow `publish.yml`, environment (if scoped)
3. Update `publish.yml` to remove `NPM_TOKEN` step, rely on OIDC alone
4. Rotate/delete the `NPM_TOKEN` secret
5. Ship v0.1.1 or v0.2.0 via Trusted Publishers to confirm

---

## Publish Procedure

Once all Sprint 3 gates are green:

```bash
# 1. Merge Sprint 2 PR to main
gh pr merge <sprint-2-pr-number> --squash

# 2. Pull latest main
git checkout main && git pull

# 3. Tag and push
git tag v0.1.0
git push origin v0.1.0

# 4. Watch the publish workflow
gh run watch
```

`.github/workflows/publish.yml` will:
1. `npm ci`
2. `npm run lint`
3. `npm run build`
4. `npm test`
5. `npm publish --provenance --access public` (auth via `NPM_TOKEN`)

Success = package at `https://www.npmjs.com/package/n8n-nodes-tokensense` with provenance badge.

**If publish fails:**
- Auth → check `NPM_TOKEN` secret and `registry-url` in workflow
- Provenance → confirm `permissions: id-token: write` in workflow
- Version collision → shouldn't happen on first publish; if it does, bump to `0.1.1` and retag
- Test failure → fix, recommit to `main`, delete failed tag (`git tag -d v0.1.0 && git push --delete origin v0.1.0`), retag

---

## Post-Publish

### Immediate (same session)

1. Run `npx @n8n/scan-community-package n8n-nodes-tokensense` — scanner result is informational (AI nodes aren't verification-eligible per n8n docs). Archive output.
2. Install from the live n8n community nodes UI on a test instance → verify install succeeds
3. Create AI Agent workflow using TokenSense Chat Model → verify ICP scenario end-to-end

### Within 48 hours

4. Add "Install Community Node" section to TokenSense Connect page (`Dashboard/app/(dashboard)/connect`) — one-click: Settings → Community Nodes → `n8n-nodes-tokensense`
5. Update `/Users/carlo/Documents/SecondBrain/01 Projects/TokenSense/n8n Community Node.md` — change status to `published-v0.1.0`, add npm + provenance links
6. Update `docs/STATUS.md` on the `tokensense` repo
7. Memory update: mark `project_n8n_integration_gap.md` resolved

### Within 1 week

8. Post to n8n community forum (AI Gateway thread + general showcase)
9. Tweet/LinkedIn announcement: *"only n8n AI Gateway with a Chat Model sub-node"*
10. Blog post on tokensense.io/blog
11. Update ICP-aligned content in TokenSense Connect Hub with per-provider native-setup instructions
12. Plan v0.2.0 sprint: embeddings + Trusted Publishers migration

---

## Open Risks

### R1 — Sprint 0 gate fails on `extraBody`
**Probability:** Low-Medium
**Impact:** Re-plan required
**Mitigation:** Sprint 0 is deliberately structured to catch this before any refactor. If `extraBody` is dropped, escalate to Carlo with three options (proxy-side query-param metadata, custom `BaseChatModel`, ship without workflow-tagging). No "fallback pattern" is pre-written in v2 — we stop and re-plan.

### R2 — `@n8n/ai-node-sdk` not runtime-resolvable in a clean n8n install
**Probability:** Low
**Impact:** Must declare as regular dependency, re-scan for compatibility
**Mitigation:** Sprint 0 § 0.4 smoke test. If it fails, switch to `"dependencies": { "@n8n/ai-node-sdk": "0.4.1" }` and re-run scanner expectations with Carlo.

### R3 — Multipart upload via `this.helpers.httpRequest`
**Probability:** Low-Medium
**Impact:** +1 hour
**Mitigation:** Three-step fallback ladder documented in § 2.4. Real `.mp3` test validates end-to-end.

### R4 — Scanner rejects the published package
**Probability:** Low (local ESLint catches most)
**Impact:** +1-2 hours to fix + republish as `0.1.1`
**Mitigation:** Run `npx @n8n/scan-community-package ./n8n-nodes-tokensense-0.1.0.tgz` before the live publish. If scanner doesn't accept local tarballs, publish `0.1.0-beta.1`, scan, fix, then `0.1.0`.

### R5 — Icon path breaks after `npm pack`
**Probability:** Low
**Impact:** Minor — cosmetic only (node still functions)
**Mitigation:** Sprint 3 § 3.3 verifies the packed path explicitly.

### R6 — n8n-workflow peer too tight
**Probability:** Low
**Impact:** Install warning for users on older n8n
**Mitigation:** If users report peer-dep warnings, relax the range in a patch release.

### R7 — `@n8n/ai-node-sdk` API break between versions
**Probability:** Low short-term
**Impact:** Minor rewrite + republish
**Mitigation:** Peer-dep capped at `<0.5.0`. Subscribe to n8n release notes.

---

## Success Criteria

- [ ] `n8n-nodes-tokensense@0.1.0` published to npm with provenance badge
- [ ] Package installable via n8n community nodes UI in production
- [ ] `TokenSense Chat Model` sub-node connects to AI Agent and executes tool-calling workflows end-to-end
- [ ] `TokenSense AI` general node passes all 8 operations in integration tests
- [ ] Metadata (`source=n8n`, `project`, `workflow_tag`, `provider`) arrives in TokenSense logs for every call
- [ ] Zero external runtime dependencies (`"dependencies": {}`)
- [ ] `npm pack --dry-run` tarball clean; `future/` not included
- [ ] Clean-install smoke test passes in `n8nio/n8n:latest` container
- [ ] CI green
- [ ] SecondBrain vault and `docs/STATUS.md` updated

**North-star post-publish (within 30 days):**
- First 5 external users install from the community nodes UI
- Zero Critical/High security issues reported
- Blog post + forum post drive >500 TokenSense.io visits from n8n ecosystem
