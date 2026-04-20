# npm Publish — Final Plan (v3)

> **Status:** Drafted 2026-04-19, awaiting Carlo approval
> **Supersedes:** `docs/plans/npm-publish-final-2026-04-19-v2.md` (v2, same date)
> **Target version:** `0.1.0`
> **Publish path:** NPM_TOKEN (Bypass-2FA granular token) for v0.1.0; Trusted Publishers migration documented for v0.2.0
> **Embeddings strategy:** Option A — relocate source to `future/`, defer registration to v0.2.0

---

## Why v3 exists

v2 was written based on reasoned agreement with ChatGPT's feedback. v3 is written after a full empirical audit against the actual SDK source, the actual scanner plugin, the TokenSense proxy source, and n8n's own published package manifests. The audit surfaced three corrections v2 got wrong, and confirmed the rest.

### Audit results — ChatGPT's 5 blockers

| # | ChatGPT concern | v3 verdict | Evidence |
|---|-----------------|-----------|----------|
| 1 | Proxy requires `x-tokensense-key`; `supplyModel()` sends `Authorization: Bearer` — auth mismatch. | **REJECTED.** | `Proxy/auth.js:5,23-28` — proxy accepts 5 auth schemes including `Authorization: Bearer`. Simple `OpenAiModel` pattern auths cleanly. |
| 2 | `@n8n/ai-node-sdk` must be resolvable at runtime in a clean n8n install. | **CONFIRMED SAFE.** | `n8n-io/n8n/packages/cli/package.json` declares `@n8n/ai-node-sdk: workspace:*`. The published `n8n` npm package ships the SDK. Additionally, `@n8n/eslint-plugin-community-nodes@0.10.0`'s `no-restricted-imports` allowlist explicitly includes `@n8n/ai-node-sdk`. Declare as `peerDependency` in our node — n8n's runtime provides it. |
| 3 | `BaseChatModel` fallback is open-ended. | **SMALLER THAN CLAIMED, MOOT.** | `@n8n/ai-utilities/dist/esm/chat-model/base.d.ts` declares only 2 abstract methods (`generate`, `stream`). But also moot — Sprint 2.3's simple `supplyModel` + `additionalParams` path works (see finding A below). |
| 4 | Unregistered `TokenSenseEmbeddings` source in tsconfig `include` poisons lint + build. | **CONFIRMED.** | `TokenSenseEmbeddings.node.ts:9` imports `@langchain/openai` (denied by allowlist). Lines 101-102 use `globalThis.fetch` (denied by restricted-globals). Move file to `future/`, exclude from tsconfig + eslint glob. |
| 5 | Pick one publish path for v0.1.0. | **CONFIRMED.** | `gh secret list` shows `NPM_TOKEN` present (2026-04-19 04:33 UTC). Current `publish.yml` uses it. Commit to that path; Trusted Publishers documented for v0.2.0. |

### New findings the audit surfaced (v2 missed these)

- **Finding A — SDK field name is wrong in v2.** v2 specified `extraBody: { metadata }`. The real field is `additionalParams: { metadata }`. Traced in `@n8n/ai-utilities/dist/esm/suppliers/supplyModel.js:47` — it maps `model.additionalParams` → LangChain's `modelKwargs`, which OpenAI's client serialises into the HTTP request body. Current v1 source already uses `modelKwargs: { metadata }` on the raw `ChatOpenAI` — the `supplyModel` migration only needs to rename the outer wrapper key.
- **Finding B — `no-http-request-with-manual-auth` rule fires on every TokenSenseAi operation.** The scanner's rule reports any function that calls both `this.getCredentials()` and `this.helpers.httpRequest()` in the same scope. Every one of TokenSenseAi's 8 operations does both. v2's sprint plan doesn't address this. Fix: add an `authenticate` block to `TokenSenseApi.credentials.ts` and rewrite every call site to use `this.helpers.httpRequestWithAuthentication.call(this, 'tokenSenseApi', opts)`. Applies to `TokenSenseAi.node.ts` (all 8 ops) and `shared/utils.ts:loadModels`.
- **Finding C — scanner allowlist is exact and small.** Only these modules are importable from community-node source: `n8n-workflow`, `@n8n/ai-node-sdk`, `ai-node-sdk` (bare alias), `lodash`, `moment`, `p-limit`, `luxon`, `zod`, `crypto`, `node:crypto`. Everything else → `restrictedImport` lint error. `Buffer` usage is fine (it's a global, not an import, and isn't on the restricted-globals list).
- **Finding D — exact pin for the plugin.** `@n8n/eslint-plugin-community-nodes@0.10.0` is the current stable (11 versions published, latest 3 weeks ago). v2 said "pin exactly" without a value — v3 pins `0.10.0`.

### What stayed correct from v2

- `@n8n/node-cli@^0.23.0` exists (current 0.23.1) and bundles the lint plugin. Good choice as the build tool.
- Jest 30 → 29.7 downgrade to match ts-jest 29.
- `normalizeBaseUrl()` helper still needed — users pasting `/v1` on the endpoint still double-up.
- Move `TokenSenseEmbeddings` to `future/` still the right move (confirmed by audit).
- Commit to NPM_TOKEN for v0.1.0, Trusted Publishers migration for v0.2.0.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Sprint 0 — Soft Feasibility Check (optional belt-and-braces)](#sprint-0--soft-feasibility-check-optional-belt-and-braces)
3. [Sprint 1 — Tooling Foundation](#sprint-1--tooling-foundation)
4. [Sprint 2 — Scanner-Clean Refactor](#sprint-2--scanner-clean-refactor)
5. [Sprint 3 — Last Pass + Publish Prep](#sprint-3--last-pass--publish-prep)
6. [Carlo's Manual Steps](#carlos-manual-steps)
7. [Publish Procedure](#publish-procedure)
8. [Post-Publish](#post-publish)
9. [Open Risks](#open-risks)
10. [Success Criteria](#success-criteria)

---

## Executive Summary

Ship `n8n-nodes-tokensense@0.1.0` to npm, scanner-clean, with:
- `TokenSense Chat Model` sub-node (AI Agent `ai_languageModel` output, via `supplyModel()` + `OpenAiModel` with `additionalParams.metadata`)
- `TokenSense AI` general node (8 operations, authenticated via `httpRequestWithAuthentication` + credential `authenticate` block)
- `TokenSenseApi` credential (endpoint + API key, `authenticate` block injecting `x-tokensense-key` header, declarative `test` via `GET /v1/models`)

Deferred to v0.2.0:
- `TokenSense Embeddings` sub-node (source relocated to `future/`)
- OIDC Trusted Publishers migration
- Custom `BaseChatModel` subclass (only if needed for future metadata patterns the simple path can't carry)

**Four sprints, ~5-8 hours of Claude Code execution + Carlo's manual steps already complete.**

---

## Sprint 0 — Soft Feasibility Check (optional belt-and-braces)

**Duration:** ~15 min
**Goal:** Quick empirical reconfirmation that the conclusions from this document's audit still hold on Carlo's Mac. Not a blocker gate.

Because the audit already verified the hard questions against published manifests and source code, Sprint 0 is mostly a safety net. It's worth running anyway to catch any last-48-hours regressions (e.g., if n8n ships a breaking change to the SDK between now and dispatch).

### 0.1 Confirm Bearer auth still works against production

```bash
curl -sS -X POST https://api.tokensense.io/v1/chat/completions \
  -H "Authorization: Bearer $TS_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}],"max_tokens":5}'
```

Must return a 200 with a completion. If it fails, v3's premise breaks.

### 0.2 Confirm SDK version and `additionalParams` mapping

```bash
npm view @n8n/ai-node-sdk version  # expect 0.4.1+
npm view @n8n/ai-node-sdk dependencies
```

The SDK's only runtime dep is `@n8n/ai-utilities`. Good — nothing restricted creeps in.

### 0.3 (Optional) Docker smoke test against clean n8n

If Docker Desktop is running:

```bash
docker run --rm -it n8nio/n8n:latest /bin/sh -c "
  node -e \"console.log(typeof require('@n8n/ai-node-sdk').supplyModel)\"
"
```

Expected output: `function`. If it prints `undefined` or throws, escalate — but n8n's `packages/cli/package.json` declaring `@n8n/ai-node-sdk: workspace:*` makes this outcome very unlikely.

### 0.4 Gate decision

If 0.1 green → proceed. (0.2 and 0.3 are nice-to-have confirmations.)

If 0.1 red → proxy auth has changed; stop and re-plan.

**Commit:** none. Sprint 0 is diagnostic.

---

## Sprint 1 — Tooling Foundation

**Duration:** ~60-90 min
**Goal:** Official n8n scaffold drives build/lint/dev/release. ESLint 9 flat config with the *exact* community-nodes rules n8n applies. CI runs lint + build + test on every PR.

### 1.1 Install dev dependencies (exact pins)

```bash
npm install --save-dev \
  @n8n/node-cli@^0.23.0 \
  @n8n/eslint-plugin-community-nodes@0.10.0 \
  eslint-plugin-n8n-nodes-base@^1.16.2 \
  eslint@^9.0.0 \
  @typescript-eslint/parser@^8.0.0
```

Downgrade Jest to match ts-jest 29:

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

If `n8n-node build` does not copy icons into `dist/`, keep `postbuild: cp -r icons dist/icons` as a separate hook.

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

`future/**` is ignored — that's where `TokenSenseEmbeddings` moves in Sprint 2.1.

### 1.4 Tighten `tsconfig.json`

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

### 1.6 Dry-run `npm run lint`

**Expected violations** (inventoried, not fixed yet — Sprint 2 handles these):

| File:line | Rule | Details |
|-----------|------|---------|
| `nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts:9` | `no-restricted-imports` | `@langchain/openai` — not on allowlist |
| `nodes/TokenSenseAi/TokenSenseAi.node.ts:9` | `no-restricted-imports` | `form-data` — not on allowlist |
| `nodes/TokenSenseAi/TokenSenseAi.node.ts` (all 8 ops) | `no-http-request-with-manual-auth` | every op calls `getCredentials` + `httpRequest` in same scope |
| `shared/utils.ts` `loadModels` | `no-http-request-with-manual-auth` | calls `getCredentials` + `httpRequest` |

After moving embeddings to `future/` (Sprint 2.1), there should be **zero restricted-globals** violations and exactly the restricted-imports violations above.

Other rules the config enables that may fire cosmetically:
- `credential-password-field` — `apiKey` is already `typeOptions: { password: true }` ✓
- `credential-documentation-url` — present ✓
- `credential-test-required` — present ✓
- `icon-validation` — verify `icons/tokensense.svg` exists ✓
- `ai-node-package-json` — verify package.json has required AI-node fields
- `node-usable-as-tool` / `node-class-description-icon-missing` / `resource-operation-pattern` — may fire; handle case-by-case in Sprint 3

**Commit structure:**
- `chore: adopt @n8n/node-cli scaffold`
- `chore: add flat ESLint 9 config with @n8n/community-nodes@0.10.0`
- `chore: downgrade Jest to 29.7 for ts-jest compatibility`
- `chore: exclude future/ from tsconfig and lint`
- `ci: run lint + build + test on every PR`

Open PR `Sprint 1: tooling foundation` against `main`.

### Acceptance
- `npm run lint` runs without crashing (violations expected — Sprint 2 clears them)
- `npm run build` passes with no `future/` compilation attempts
- CI workflow green after push

---

## Sprint 2 — Scanner-Clean Refactor

**Duration:** ~3-4 hours
**Goal:** `"dependencies": {}`. All lint violations cleared. Every HTTP call authenticated via the credential. Metadata still reaches TokenSense logs.

### 2.1 Move embeddings out of scope

```bash
mkdir -p future
git mv nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts future/TokenSenseEmbeddings.node.ts
git rm -rf nodes/TokenSenseEmbeddings/
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

`future/` is already excluded from tsconfig + lint (Sprint 1). The packed tarball is driven by `files: ["dist", "icons", "package.json", "LICENSE", "README.md"]` — `future/` isn't listed, so it doesn't ship.

### 2.2 Add `authenticate` block to the credential

**File:** `credentials/TokenSenseApi.credentials.ts`

```typescript
import type {
  IAuthenticateGeneric,
  ICredentialType,
  ICredentialTestRequest,
  INodeProperties,
} from 'n8n-workflow';

export class TokenSenseApi implements ICredentialType {
  name = 'tokenSenseApi';
  displayName = 'TokenSense API';
  documentationUrl = 'https://github.com/TheYote12/n8n-nodes-tokensense';

  properties: INodeProperties[] = [
    {
      displayName: 'TokenSense Endpoint',
      name: 'endpoint',
      type: 'string',
      default: 'https://api.tokensense.io',
      required: true,
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        'x-tokensense-key': '={{$credentials.apiKey}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.endpoint}}',
      url: '/v1/models',
    },
  };
}

export default TokenSenseApi;
```

Note: the `test` block no longer needs an explicit `x-tokensense-key` header because `authenticate` now injects it. Both manual-auth and declarative-test work on the same credential properties.

### 2.3 Add `normalizeBaseUrl()` helper

**File:** `shared/utils.ts` (extend)

```typescript
export function normalizeBaseUrl(input: string): string {
  // Users may paste "https://api.tokensense.io", "https://api.tokensense.io/",
  // or "https://api.tokensense.io/v1" — all must normalise to the bare origin.
  const trimmed = input.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/v1$/, '');
}
```

Unit tests in `test/utils.test.ts`:
- `normalizeBaseUrl('https://api.tokensense.io')` → `'https://api.tokensense.io'`
- `normalizeBaseUrl('https://api.tokensense.io/')` → `'https://api.tokensense.io'`
- `normalizeBaseUrl('https://api.tokensense.io/v1')` → `'https://api.tokensense.io'`
- `normalizeBaseUrl('https://api.tokensense.io/v1/')` → `'https://api.tokensense.io'`

### 2.4 Rewrite `TokenSenseChatModel` with `supplyModel` + `additionalParams`

**File:** `nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts`

**Replace lines 1-10 and `supplyData` body.** Description block, property definitions, and `getModels` loadOption stay as-is.

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

// ... description block and methods unchanged ...

async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
  const credentials = await this.getCredentials('tokenSenseApi');
  const model = this.getNodeParameter('model', itemIndex) as string;
  const temperature = this.getNodeParameter('temperature', itemIndex) as number;
  const maxTokens = this.getNodeParameter('maxTokens', itemIndex, 0) as number;
  const streaming = this.getNodeParameter('streaming', itemIndex, true) as boolean;
  const metadata = buildMetadata(this, itemIndex, { includeProvider: true });

  const origin = normalizeBaseUrl(credentials.endpoint as string);

  const modelConfig: OpenAiModel = {
    type: 'openai',
    model,
    baseUrl: `${origin}/v1`,
    apiKey: credentials.apiKey as string,
    temperature,
    streaming,
    ...(maxTokens > 0 ? { maxTokens } : {}),
    additionalParams: { metadata },
  };

  return supplyModel(this, modelConfig);
}
```

**Why `additionalParams` not `extraBody`:** traced in `@n8n/ai-utilities@0.7.1/dist/esm/suppliers/supplyModel.js:47` — `supplyModel` passes `model.additionalParams` into `ChatOpenAI` as `modelKwargs`, which serialises into the HTTP request body. TokenSense proxy reads `metadata` from the body today.

**Why Bearer auth works:** traced in `Proxy/auth.js:23-28` — proxy accepts `Authorization: Bearer <key>` as a primary auth scheme. `supplyModel` hands `apiKey` to `ChatOpenAI` which sends it as `Authorization: Bearer <apiKey>`.

**Acceptance:**
- No `@langchain/openai` import in `TokenSenseChatModel.node.ts`
- Node appears as `ai_languageModel` output in n8n UI
- Connected to AI Agent → full chat works end-to-end against `https://api.tokensense.io`
- TokenSense logs show `metadata.source`, `metadata.project`, `metadata.workflow_tag`, `metadata.provider`
- Streaming works (token-by-token render)
- Tool calling works (AI Agent with a tool node)

### 2.5 Migrate TokenSenseAi to `httpRequestWithAuthentication`

**File:** `nodes/TokenSenseAi/TokenSenseAi.node.ts`

Every operation currently does:

```typescript
const credentials = await this.getCredentials('tokenSenseApi');
const endpoint = credentials.endpoint as string;
const apiKey = credentials.apiKey as string;
const response = await this.helpers.httpRequest({
  method: 'POST',
  url: `${endpoint}/v1/...`,
  headers: { 'x-tokensense-key': apiKey, ... },
  body: { ... },
});
```

**Pattern after:**

```typescript
const credentials = await this.getCredentials('tokenSenseApi');
const endpoint = normalizeBaseUrl(credentials.endpoint as string);
const response = await this.helpers.httpRequestWithAuthentication.call(
  this,
  'tokenSenseApi',
  {
    method: 'POST',
    baseURL: endpoint,
    url: '/v1/...',
    body: { ... },
  },
);
```

Key changes:
- No manual `x-tokensense-key` header — `authenticate` block on the credential injects it.
- Still reads `credentials.endpoint` so we can normalise the base URL and compute the full path.
- Drops `apiKey` local variable (no longer needed after auth moves to the credential).

**Operations to migrate (all 8):**
1. `chatCompletion`
2. `generateImage`
3. `generateEmbedding`
4. `generateSpeech`
5. `transcribeAudio` (see 2.6 for form-data swap)
6. `nativeAnthropic`
7. `nativeGemini`
8. `listModels`

**Also migrate in `shared/utils.ts`:** the `loadModels` helper follows the same pattern — use `httpRequestWithAuthentication.call(this, 'tokenSenseApi', {...})`.

### 2.6 Replace `form-data` in `transcribeAudio`

**File:** `nodes/TokenSenseAi/TokenSenseAi.node.ts` (lines 9, 648-673)

Remove the `import FormData from 'form-data';` line. Rewrite `transcribeAudio` to use n8n's built-in multipart support via `httpRequestWithAuthentication`:

```typescript
} else if (operation === 'transcribeAudio') {
  const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
  const model = this.getNodeParameter('sttModel', i) as string;
  const language = this.getNodeParameter('sttLanguage', i, '') as string;
  const responseFormat = this.getNodeParameter('sttFormat', i) as string;
  const binaryBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
  const binaryMeta = items[i].binary?.[binaryPropertyName];
  const fileName = binaryMeta?.fileName ?? 'audio.wav';
  const mimeType = binaryMeta?.mimeType ?? 'audio/wav';

  const metadata = buildMetadata(this, i);

  const response = await this.helpers.httpRequestWithAuthentication.call(
    this,
    'tokenSenseApi',
    {
      method: 'POST',
      baseURL: endpoint,
      url: '/v1/audio/transcriptions',
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
    },
  );
  // ... rest of handler unchanged
}
```

Fallback ladder if `contentType: 'multipart-form-data'` with nested file object doesn't work:
1. `this.helpers.request.call(this, { ... formData: ... })` (legacy `request` library shape)
2. Hand-build multipart boundary with `crypto.randomUUID()` + `Buffer.concat()`

### 2.7 `package.json` — zero runtime deps

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
    "@n8n/eslint-plugin-community-nodes": "0.10.0",
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

**Remove from current package.json:**
- `dependencies.@langchain/openai`
- `dependencies.form-data`
- `overrides.langsmith`

### 2.8 Update Jest tests

- `TokenSenseChatModel.test.ts`: mock `supplyModel` from `@n8n/ai-node-sdk`; assert the `modelConfig` passed (baseUrl ends with `/v1` exactly once, apiKey set, `additionalParams.metadata` matches).
- `TokenSenseAi.test.ts`: mock `this.helpers.httpRequestWithAuthentication` (not `httpRequest`); update body-shape assertions; confirm no manual `x-tokensense-key` headers are set.
- `test/utils.test.ts`: add `normalizeBaseUrl` test cases from 2.3.
- Remove/skip embeddings tests (file relocated to `future/`).

**Acceptance:**
- `npm run lint` exits 0 on active source
- `npm test` passes (~35-40 tests after embeddings removed)
- No `@langchain/openai`, `form-data`, `langsmith` in any `package*.json`
- No manual `x-tokensense-key` or `Authorization` header construction anywhere in `nodes/` or `shared/`

### Sprint 2 Commit Structure

Single PR `Sprint 2: scanner-clean refactor`:
- `chore: relocate TokenSenseEmbeddings to future/ (deferred to v0.2.0)`
- `feat: add authenticate block to TokenSenseApi credential`
- `feat: add normalizeBaseUrl helper with tests`
- `feat: migrate TokenSenseChatModel to @n8n/ai-node-sdk supplyModel`
- `refactor: migrate TokenSenseAi to httpRequestWithAuthentication`
- `feat: replace form-data with n8n built-in multipart in transcribeAudio`
- `chore: remove @langchain/openai, form-data, langsmith override`
- `test: update mocks for scanner-clean node implementations`
- `docs: update README with v0.1.0 embeddings story`

---

## Sprint 3 — Last Pass + Publish Prep

**Duration:** ~45-60 min
**Goal:** Green locally. Packed tarball validated. Ready to tag.

### 3.1 Green path

```bash
npm run lint    # must exit 0
npm run build   # clean TypeScript compile
npm test        # all tests pass
npm pack --dry-run --json > /tmp/pack-report.json
```

### 3.2 Tarball content verification

Confirm via `/tmp/pack-report.json`:
- Includes `dist/nodes/TokenSenseAi/TokenSenseAi.node.js`, `dist/nodes/TokenSenseChatModel/TokenSenseChatModel.node.js`, `dist/credentials/TokenSenseApi.credentials.js`, `dist/icons/tokensense.svg`, `package.json`, `LICENSE`, `README.md`
- Does NOT include `node_modules/`, `.github/`, `docs/`, `test/`, `nodes/` source, `future/`
- Size < 100KB

### 3.3 Icon resolution check

```bash
npm pack  # produces n8n-nodes-tokensense-0.1.0.tgz
tar -tzf n8n-nodes-tokensense-0.1.0.tgz | grep icons
# expect: package/dist/icons/tokensense.svg

# Verify the node descriptor references the packed icon path:
tar -xzf n8n-nodes-tokensense-0.1.0.tgz --to-stdout \
  package/dist/nodes/TokenSenseAi/TokenSenseAi.node.js | grep -m1 "icon:"
# expect: icon: 'file:../../icons/tokensense.svg'  OR  icon: 'file:icons/tokensense.svg'
```

If the packed layout and the descriptor's `icon:` path disagree (e.g. the compiled `.js` resolves to a non-existent relative path after pack), fix by updating the descriptor to `file:icons/tokensense.svg` (anchored to package root, per n8n docs).

### 3.4 Clean-install smoke test (n8nio/n8n container)

If Docker Desktop is running:

```bash
docker run --rm -v "$PWD:/pkg" -p 5678:5678 n8nio/n8n:latest /bin/sh -c "
  cd /home/node &&
  npm install /pkg/n8n-nodes-tokensense-0.1.0.tgz &&
  n8n start
"
```

Then in a browser at `http://localhost:5678`:
- n8n UI loads without errors
- Nodes panel shows `TokenSense AI` and `TokenSense Chat Model`
- Create credential (endpoint + API key) → declarative test passes (calls `GET /v1/models`)
- Drop TokenSense Chat Model into a workflow with AI Agent → send a message → response returns; TokenSense logs show `metadata.source=n8n-nodes-tokensense`, `metadata.project`, `metadata.workflow_tag`

If Docker not running, skip — the scanner allowlist + n8n's own package manifest are independent confirmations. Smoke test can run post-publish.

### 3.5 Package name availability (final check)

```bash
npm view n8n-nodes-tokensense
# Expected: E404
```

### 3.6 README final polish

Confirm `README.md` covers:
- One-liner: what TokenSense is
- Install: "Settings → Community Nodes → install `n8n-nodes-tokensense`"
- Credential setup: endpoint (`https://api.tokensense.io`) + API key from app.tokensense.io/keys — note endpoint with or without trailing `/v1` is auto-normalised
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

Confirm package name, version, provenance enabled, file list.

---

## Carlo's Manual Steps

Already complete as of 2026-04-19:

- ✅ GitHub PAT `carlo-ops-dashboard-v2` has `workflow` scope
- ✅ npm Granular Access Token created with Bypass-2FA, 30-day expiry
- ✅ `NPM_TOKEN` added to GitHub repo secrets (`gh secret list` shows 2026-04-19T04:33:18Z)

**Trusted Publishers migration — deferred to v0.2.0.** Documented as a separate post-publish task:

1. After v0.1.0 ships, npmjs.com → `n8n-nodes-tokensense` → package settings → Trusted Publishers
2. Add GitHub Actions trusted publisher for `TheYote12/n8n-nodes-tokensense`, workflow `publish.yml`, environment (if scoped)
3. Update `publish.yml` to remove `NPM_TOKEN` step, rely on OIDC alone
4. Rotate/delete the `NPM_TOKEN` secret
5. Ship v0.1.1 or v0.2.0 via Trusted Publishers to confirm

---

## Publish Procedure

Once Sprint 3 gates green:

```bash
gh pr merge <sprint-2-pr-number> --squash
git checkout main && git pull
git tag v0.1.0
git push origin v0.1.0
gh run watch
```

`.github/workflows/publish.yml` runs: `npm ci` → `npm run lint` (add to workflow if not already) → `npm run build` → `npm test` → `npm publish --provenance --access public` (auth via `NPM_TOKEN`).

Success = `https://www.npmjs.com/package/n8n-nodes-tokensense` with provenance badge.

**If publish fails:**
- Auth → check `NPM_TOKEN` secret and `registry-url` in workflow
- Provenance → confirm `permissions: id-token: write` in workflow (already present)
- Version collision → bump to `0.1.1` and retag
- Test failure → fix, recommit to `main`, delete failed tag (`git tag -d v0.1.0 && git push --delete origin v0.1.0`), retag

---

## Post-Publish

### Immediate

1. Run `npx @n8n/scan-community-package n8n-nodes-tokensense` — archive output. Scanner result is informational (AI nodes aren't verification-eligible per current n8n docs).
2. Install from the live n8n community nodes UI on a test instance → verify install succeeds
3. Create AI Agent workflow using TokenSense Chat Model → verify ICP scenario end-to-end

### Within 48 hours

4. Add "Install Community Node" section to TokenSense Connect page (`Dashboard/app/(dashboard)/connect`)
5. Update `/Users/carlo/Documents/SecondBrain/01 Projects/TokenSense/n8n Community Node.md` — status `published-v0.1.0`, add npm + provenance links
6. Update `docs/STATUS.md` on `tokensense` repo
7. Memory update: mark `project_n8n_integration_gap.md` resolved

### Within 1 week

8. Post to n8n community forum (AI Gateway thread + showcase)
9. Tweet/LinkedIn announcement: *"only n8n AI Gateway with a Chat Model sub-node"*
10. Blog post on tokensense.io/blog
11. Plan v0.2.0 sprint: embeddings + Trusted Publishers migration

---

## Open Risks

### R1 — `n8n-node-cli` build/lint behaviour differs from assumed flat-config
**Probability:** Low-Medium
**Impact:** +30-60 min
**Mitigation:** If `n8n-node lint` imposes its own config and rejects our `eslint.config.mjs`, drop `@n8n/node-cli` and run `eslint` + `tsc` directly via scripts. Functionality is identical; only the wrapper differs.

### R2 — `additionalParams.metadata` is filtered client-side before reaching the wire
**Probability:** Low
**Impact:** +1 hour to switch to custom `BaseChatModel` or proxy-side query-param
**Mitigation:** Sprint 0.1 curl test confirms the proxy receives metadata. If `additionalParams` is accidentally stripped by a LangChain version on the path, a small repro in Sprint 0 flags it before Sprint 2.

### R3 — Multipart upload via `httpRequestWithAuthentication`
**Probability:** Low-Medium
**Impact:** +1 hour
**Mitigation:** Three-step fallback ladder in § 2.6. Real `.mp3` test validates end-to-end.

### R4 — Scanner rejects the published tarball for a rule we didn't catch
**Probability:** Low (we replicate the exact lint config used by the scanner)
**Impact:** +1-2 hours to fix + republish as `0.1.1`
**Mitigation:** Sprint 3.4 Docker smoke test if possible. Also publish `0.1.0-beta.1` first if Carlo wants extra belt-and-braces.

### R5 — Icon path breaks after `npm pack`
**Probability:** Low
**Impact:** Cosmetic (node still functions)
**Mitigation:** Sprint 3.3 verifies the packed path and descriptor agreement.

### R6 — n8n-workflow peer too tight
**Probability:** Low
**Impact:** Install warning for users on older n8n
**Mitigation:** Relax range in a patch release if users report peer-dep warnings.

### R7 — `@n8n/ai-node-sdk` breaks API between 0.4 and 1.0
**Probability:** Low short-term (currently on 0.8.x; 0.4.1 is stable LTS-equivalent)
**Impact:** Minor rewrite + patch release
**Mitigation:** Peer-dep capped at `<0.5.0`. Subscribe to n8n release notes.

---

## Success Criteria

- [ ] `n8n-nodes-tokensense@0.1.0` published to npm with provenance badge
- [ ] Package installable via n8n community nodes UI in production
- [ ] `TokenSense Chat Model` connects to AI Agent and executes tool-calling workflows
- [ ] `TokenSense AI` passes all 8 operations end-to-end
- [ ] Metadata (`source`, `project`, `workflow_tag`, `provider`) arrives in TokenSense logs for every call
- [ ] Zero external runtime dependencies (`"dependencies": {}`)
- [ ] Zero manual `x-tokensense-key` or `Authorization` header construction in source
- [ ] `npm pack` tarball clean; `future/` not included
- [ ] CI green
- [ ] SecondBrain vault and `docs/STATUS.md` updated

**North-star post-publish (within 30 days):**
- First 5 external users install from the community nodes UI
- Zero Critical/High security issues reported
- Blog post + forum post drive >500 TokenSense.io visits from n8n ecosystem
