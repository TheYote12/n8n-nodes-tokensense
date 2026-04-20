# npm Publish — Final Plan (v4)

> **Status:** Drafted 2026-04-19, awaiting Carlo approval
> **Supersedes:** `docs/plans/npm-publish-final-2026-04-19-v3.md`
> **Target version:** `0.1.0`
> **Publish path:** NPM_TOKEN (Bypass-2FA granular token) for v0.1.0; Trusted Publishers migration documented for v0.2.0
> **Embeddings strategy:** Option A — relocate source to `future/`, defer registration to v0.2.0

---

## Why v4 exists

v3 was written after the first empirical audit but still carried several un-checked assumptions. v4 applies eight corrections Carlo called out before dispatch:

1. **SDK peer range contradiction fixed.** npm + n8n master both show `@n8n/ai-node-sdk@0.8.0` (published 2026-04-13). v3's `>=0.4.1 <0.5.0` would exclude every current n8n runtime. v4 targets the 0.8.x line.
2. **Sprint 0 is mandatory, not optional.** Three gates must all pass before Sprint 1.
3. **Credential test path normalized.** `/v1/v1/models` failure mode closed.
4. **Deferred embeddings tests cannot be discovered by Jest.** Explicit `testPathIgnorePatterns` + relocation, no "skip via glob" assumption.
5. **Packed-tarball clean-install smoke test is mandatory before tagging v0.1.0.**
6. **Install/cloud wording corrected.** Only claim what's verified: installable from npm on self-hosted n8n. No n8n Cloud / verified-panel claim. No "AI nodes aren't verification-eligible" claim.
7. **`package.json` `files` is explicit** (dist, icons, README.md, LICENSE) with `future/`, `test/`, `docs/`, source `nodes/` confirmed excluded.
8. **Custom `BaseChatModel` subclass is out of scope for v0.1.0.** If `supplyModel` can't carry metadata/streaming/tool-calling cleanly, stop and re-plan — do not in-sprint rewrite to a custom subclass.

### Source of truth on the SDK version

- `npm registry` — `@n8n/ai-node-sdk` latest = `0.8.0` (2026-04-13)
- `n8n-io/n8n/packages/@n8n/ai-node-sdk/package.json` (master) — `"version": "0.8.0"`, deps: `"@n8n/ai-utilities": "workspace:*"`
- `n8n-io/n8n/packages/cli/package.json` (master) — declares `@n8n/ai-node-sdk: workspace:*`, so the published `n8n` npm package ships whichever SDK version was workspaced at release time (currently 0.8.0)

v4 pins peer + dev deps accordingly: `peerDependencies.@n8n/ai-node-sdk: ">=0.8.0 <0.9.0"`, `devDependencies.@n8n/ai-node-sdk: "0.8.0"`. Sprint 0.3 (mandatory) reconfirms this against a running n8n container before we freeze the range.

### Audit results — ChatGPT's 5 blockers (carried from v3)

| # | Concern | Verdict | Evidence |
|---|---------|---------|----------|
| 1 | Proxy needs `x-tokensense-key`; `supplyModel()` sends `Authorization: Bearer` — auth mismatch. | **REJECTED.** | `Proxy/auth.js:23-28` — proxy accepts 5 auth schemes including `Authorization: Bearer`. |
| 2 | `@n8n/ai-node-sdk` must be runtime-resolvable in a clean n8n install. | **CONFIRMED SAFE.** | n8n master's `packages/cli/package.json` declares it as `workspace:*`; scanner allowlist includes it. Sprint 0.3 reconfirms against a running container. |
| 3 | `BaseChatModel` fallback is open-ended. | **OUT OF SCOPE.** | `@n8n/ai-utilities` declares 2 abstract methods but we are NOT writing a custom subclass for v0.1.0 (see correction 8). |
| 4 | Unregistered `TokenSenseEmbeddings` source poisons lint + build. | **CONFIRMED.** | `TokenSenseEmbeddings.node.ts:9` imports `@langchain/openai` (denied). Lines 101-113 use `globalThis.fetch` (denied). Relocation + lint+tsc+jest excludes applied. |
| 5 | Pick one publish path for v0.1.0. | **CONFIRMED.** | `NPM_TOKEN` present in repo secrets (2026-04-19 04:33 UTC). Committed to NPM_TOKEN; Trusted Publishers documented for v0.2.0. |

### New findings from the audit (v2 missed these — v3 caught them — v4 keeps)

- **Finding A — SDK field name is `additionalParams`, not `extraBody`.** Traced in `@n8n/ai-utilities .../suppliers/supplyModel.js:47` → maps `model.additionalParams` to LangChain `modelKwargs` → serialises into HTTP body. Reconfirm in Sprint 0.2 against `@n8n/ai-node-sdk@0.8.0` (API may have drifted since 0.4.x).
- **Finding B — `no-http-request-with-manual-auth` rule fires on 8 TokenSenseAi operations + `loadModels`.** Fix: add `authenticate` block to `TokenSenseApi.credentials.ts` + migrate every call site to `httpRequestWithAuthentication`.
- **Finding C — Scanner allowlist.** `n8n-workflow`, `@n8n/ai-node-sdk`, `ai-node-sdk`, `lodash`, `moment`, `p-limit`, `luxon`, `zod`, `crypto`, `node:crypto`. Everything else → lint error.
- **Finding D — Plugin version pinned exactly.** `@n8n/eslint-plugin-community-nodes@0.10.0`.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Sprint 0 — Runtime Feasibility Gate (MANDATORY)](#sprint-0--runtime-feasibility-gate-mandatory)
3. [Sprint 1 — Tooling Foundation](#sprint-1--tooling-foundation)
4. [Sprint 2 — Scanner-Clean Refactor](#sprint-2--scanner-clean-refactor)
5. [Sprint 3 — Packed Tarball Validation + Publish Prep](#sprint-3--packed-tarball-validation--publish-prep)
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
- `TokenSenseApi` credential (endpoint + API key, `authenticate` block injecting `x-tokensense-key` header, declarative `test` via `GET /v1/models`, bare-origin endpoint only — `/v1` stripped if pasted)

Deferred to v0.2.0:
- `TokenSense Embeddings` sub-node (source relocated to `future/`)
- OIDC Trusted Publishers migration
- Custom `BaseChatModel` subclass (only if a future metadata pattern can't ride the simple `additionalParams` path)

**Four sprints. All of Sprint 0's three gates, Sprint 3's packed-tarball smoke test, and the full lint+build+test matrix must be green before `git tag v0.1.0`.**

---

## Sprint 0 — Runtime Feasibility Gate (MANDATORY)

**Duration:** ~30-45 min
**Goal:** Empirically confirm the three load-bearing assumptions of this plan against real runtimes BEFORE Sprint 1 begins. All three gates are hard blockers. If any gate fails, stop and re-plan — do not proceed to Sprint 1.

### 0.1 (GATE) Bearer auth passes against production proxy

```bash
export TS_TEST_KEY="<Carlo's test-workspace TokenSense key>"
curl -sS -X POST https://api.tokensense.io/v1/chat/completions \
  -H "Authorization: Bearer $TS_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
  -w "\nHTTP %{http_code}\n"
```

**Pass criteria:** HTTP 200 + valid completion payload.
**Fail action:** Stop. Proxy auth contract changed → rewrite plan around `x-tokensense-key` (would bar `supplyModel` unless we override the auth header).

### 0.2 (GATE) Metadata in request body lands in TokenSense logs

```bash
export MARK="v4-audit-$(date +%s)"
curl -sS -X POST https://api.tokensense.io/v1/chat/completions \
  -H "Authorization: Bearer $TS_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\":\"gpt-4o-mini\",
    \"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],
    \"max_tokens\":5,
    \"metadata\":{\"source\":\"v4-gate\",\"workflow_tag\":\"$MARK\"}
  }"
```

Then query TokenSense Dashboard → Logs → filter by `workflow_tag = $MARK`:
- A log entry exists
- Shows `source = v4-gate` and `workflow_tag = <MARK>`

**Pass criteria:** the log row appears with both metadata fields.
**Fail action:** Stop. Proxy stopped parsing body-level `metadata` → plan must rework around query-param or header-based metadata propagation.

### 0.3 (GATE) Clean n8n runtime resolves `@n8n/ai-node-sdk@0.8.x`

Preferred — Docker:

```bash
docker run --rm n8nio/n8n:latest /bin/sh -c '
  node -e "
    const sdk = require(\"@n8n/ai-node-sdk\");
    const pkg = require(\"@n8n/ai-node-sdk/package.json\");
    console.log(\"VERSION\", pkg.version);
    console.log(\"HAS_supplyModel\", typeof sdk.supplyModel);
  "
'
```

Expected:
```
VERSION 0.8.0        (or 0.8.x — pin matches)
HAS_supplyModel function
```

Fallback if Docker Desktop is unavailable — fresh n8n on the Mac:

```bash
mkdir -p /tmp/n8n-gate && cd /tmp/n8n-gate
npm init -y >/dev/null
npm install n8n@latest --no-save --prefix . >/tmp/n8n-install.log 2>&1
node -e '
  const p = require("./node_modules/n8n/package.json");
  const sdk = require("./node_modules/@n8n/ai-node-sdk");
  const sdkPkg = require("./node_modules/@n8n/ai-node-sdk/package.json");
  console.log("N8N_VERSION", p.version);
  console.log("SDK_VERSION", sdkPkg.version);
  console.log("HAS_supplyModel", typeof sdk.supplyModel);
'
```

**Pass criteria:** SDK version ≥ 0.8.0 < 0.9.0, and `supplyModel` is a function.
**Fail action:** Stop. Either SDK isn't shipped with n8n after all (revisit peer vs. dependency decision), or the API moved. Re-plan.

### 0.4 Determine the exact peer-range floor/ceiling

From 0.3's output, record `SDK_VERSION`. Set:
- `peerDependencies.@n8n/ai-node-sdk`: `">=${major}.${minor}.0 <${major}.${minor+1}.0"` (e.g. `">=0.8.0 <0.9.0"`)
- `devDependencies.@n8n/ai-node-sdk`: `"${major}.${minor}.${patch}"` (exact match of what the runtime ships)

**Default target for v4 (confirm in 0.3):** peer `">=0.8.0 <0.9.0"`, dev `"0.8.0"`.

### 0.5 Confirm `additionalParams` still flows to the request body in 0.8.x

Minimal repro in the same `/tmp/n8n-gate` directory:

```bash
node -e '
  const { supplyModel } = require("./node_modules/@n8n/ai-node-sdk");
  // Inspect SDK source to confirm additionalParams still maps to modelKwargs
  const src = require("fs").readFileSync(
    "./node_modules/@n8n/ai-utilities/dist/esm/suppliers/supplyModel.js",
    "utf8"
  );
  console.log(src.includes("additionalParams") ? "OK additionalParams mapped" : "BROKEN — field renamed");
'
```

**Pass criteria:** `OK additionalParams mapped`.
**Fail action:** Stop. SDK renamed the field between 0.4 and 0.8. Grep source for the new field name; update Sprint 2.4 accordingly.

### Sprint 0 Commit

None — all diagnostic. Record results in `docs/audits/sprint-0-feasibility-2026-04-19.md` (timestamps, exact SDK version, log row id from 0.2, SDK source grep output from 0.5).

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

### 1.4 Tighten `tsconfig.json`

```json
{
  "compilerOptions": { /* unchanged */ },
  "include": ["nodes/**/*.ts", "credentials/**/*.ts", "shared/**/*.ts"],
  "exclude": ["node_modules", "dist", "test", "future"]
}
```

### 1.5 Add explicit `jest.config.js`

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/future/'],
};
```

Why explicit: correction #4. Relying on a `test/` → `future/` rename alone could still let Jest discover files if any pattern in a future change broadens `roots` or falls back to default `**/*.test.ts` discovery. `testPathIgnorePatterns` makes `future/` off-limits regardless of how the test roots expand.

### 1.6 Update `.github/workflows/ci.yml`

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

### 1.7 Dry-run `npm run lint`

**Expected violations** (inventoried, not fixed yet — Sprint 2 handles these):

| File:line | Rule | Details |
|-----------|------|---------|
| `nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts:9` | `no-restricted-imports` | `@langchain/openai` — not on allowlist |
| `nodes/TokenSenseAi/TokenSenseAi.node.ts:9` | `no-restricted-imports` | `form-data` — not on allowlist |
| `nodes/TokenSenseAi/TokenSenseAi.node.ts` (all 8 ops) | `no-http-request-with-manual-auth` | every op calls `getCredentials` + `httpRequest` in same scope |
| `shared/utils.ts` `loadModels` | `no-http-request-with-manual-auth` | calls `getCredentials` + `httpRequest` |

After moving embeddings to `future/` (Sprint 2.1), there should be zero `restricted-globals` violations and exactly the `restricted-imports` violations above.

Other rules the config may enable:
- `credential-password-field` — `apiKey` is already `typeOptions: { password: true }` ✓
- `credential-documentation-url` — present ✓
- `credential-test-required` — present ✓
- `icon-validation` — verify `icons/tokensense.svg` exists ✓
- `ai-node-package-json` — verify required AI-node fields

**Commit structure:**
- `chore: adopt @n8n/node-cli scaffold`
- `chore: add flat ESLint 9 config with @n8n/community-nodes@0.10.0`
- `chore: add explicit jest.config.js excluding future/`
- `chore: downgrade Jest to 29.7 for ts-jest compatibility`
- `chore: exclude future/ from tsconfig and lint`
- `ci: run lint + build + test on every PR`

Open PR `Sprint 1: tooling foundation` against `main`.

### Acceptance
- `npm run lint` runs without crashing (violations expected — Sprint 2 clears them)
- `npm run build` passes with no `future/` compilation attempts
- `npm test` does not discover any file under `future/`
- CI workflow green after push

---

## Sprint 2 — Scanner-Clean Refactor

**Duration:** ~3-4 hours
**Goal:** `"dependencies": {}`. All lint violations cleared. Every HTTP call authenticated via the credential. Metadata still reaches TokenSense logs.

### 2.1 Relocate embeddings to `future/`

```bash
mkdir -p future
git mv nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts future/TokenSenseEmbeddings.node.ts
git rm -rf nodes/TokenSenseEmbeddings/
git mv test/TokenSenseEmbeddings.test.ts future/TokenSenseEmbeddings.test.ts
```

Belt-and-braces: rename the relocated test file to break default Jest discovery even if `testPathIgnorePatterns` is ever removed:

```bash
git mv future/TokenSenseEmbeddings.test.ts future/TokenSenseEmbeddings.test.ts.bak
```

Jest finds `*.test.ts`, not `*.test.ts.bak`. Combined with `testPathIgnorePatterns` (Sprint 1.5) and `tsconfig.exclude` (Sprint 1.4), the embeddings file is excluded from three independent systems.

Remove embeddings from `package.json` `n8n.nodes[]`:

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

### 2.2 Add `authenticate` block to the credential + fix endpoint normalization

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
      placeholder: 'https://api.tokensense.io',
      description:
        'Base URL of your TokenSense gateway. Enter the bare origin only — do NOT include /v1 (e.g. https://api.tokensense.io).',
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
      baseURL: '={{ ($credentials.endpoint as string).replace(/\\/+$/, "").replace(/\\/v1$/, "") }}',
      url: '/v1/models',
    },
  };
}

export default TokenSenseApi;
```

**Correction #3 applied.** The `test.request.baseURL` expression strips a trailing slash and then strips a trailing `/v1` before appending `/v1/models`. Cases covered:

| User input | Effective test URL |
|------------|-------------------|
| `https://api.tokensense.io` | `https://api.tokensense.io/v1/models` ✓ |
| `https://api.tokensense.io/` | `https://api.tokensense.io/v1/models` ✓ |
| `https://api.tokensense.io/v1` | `https://api.tokensense.io/v1/models` ✓ (not `/v1/v1/models`) |
| `https://api.tokensense.io/v1/` | `https://api.tokensense.io/v1/models` ✓ |

If the n8n expression engine rejects chained `.replace()` on a credential-test template (needs verified in Sprint 0.4 as a side check, or during Sprint 2.8 test pass), fall back to: leave `baseURL: '={{$credentials.endpoint}}/v1/models'` plain-text and enforce bare-origin-only input via the `description` + a client-side validator in the property (`validateType: 'url'` won't cover this; use a custom regex via `typeOptions.regexp`).

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
- `normalizeBaseUrl('https://api.tokensense.io//v1//')` → `'https://api.tokensense.io'`

### 2.4 Rewrite `TokenSenseChatModel` with `supplyModel` + `additionalParams`

**File:** `nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts`

Replace imports and the `supplyData` body; description block + `getModels` loadOption stay as-is.

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

**Correction #8 applied.** If, during implementation, any of the following fails:
- `supplyModel` does not accept `additionalParams` in SDK 0.8.x
- metadata set via `additionalParams` does not reach the HTTP body
- `streaming: true` causes `additionalParams` to be dropped
- tool-calling with an AI Agent causes `additionalParams` to be dropped

**Stop and re-plan.** Do not write a custom `BaseChatModel` subclass in this sprint. Open a tracking ticket, update the plan, and return to Carlo for a go/no-go. v0.1.0 either ships with the simple path working, or it doesn't ship.

### 2.5 Migrate TokenSenseAi to `httpRequestWithAuthentication`

**File:** `nodes/TokenSenseAi/TokenSenseAi.node.ts`

Every operation currently has the shape:

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

After:

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
- No manual `x-tokensense-key` header — credential `authenticate` block injects it.
- `endpoint` reads `credentials.endpoint` then normalises.
- `apiKey` local variable removed.

Operations to migrate (all 8): `chatCompletion`, `generateImage`, `generateEmbedding`, `generateSpeech`, `transcribeAudio` (see 2.6), `nativeAnthropic`, `nativeGemini`, `listModels`.

Also migrate in `shared/utils.ts:loadModels`.

### 2.6 Replace `form-data` in `transcribeAudio`

**File:** `nodes/TokenSenseAi/TokenSenseAi.node.ts`

Remove `import FormData from 'form-data';`. Rewrite via built-in multipart:

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
}
```

Fallback ladder if the nested-file body shape doesn't serialise:
1. `this.helpers.request.call(this, { ... formData: ... })` (legacy shape)
2. Hand-build multipart with `crypto.randomUUID()` + `Buffer.concat()` (allowed: `crypto` is on the allowlist)

### 2.7 `package.json` — zero runtime deps + explicit `files`

```json
{
  "name": "n8n-nodes-tokensense",
  "version": "0.1.0",
  "description": "TokenSense community nodes for n8n — AI gateway, cost tracking, and workflow analytics",
  "license": "MIT",
  "main": "dist/index.js",
  "files": [
    "dist",
    "icons",
    "README.md",
    "LICENSE"
  ],
  "scripts": { /* see Sprint 1.2 */ },
  "dependencies": {},
  "peerDependencies": {
    "n8n-workflow": ">=2.13.0 <3.0.0",
    "@n8n/ai-node-sdk": ">=0.8.0 <0.9.0"
  },
  "devDependencies": {
    "@n8n/ai-node-sdk": "0.8.0",
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
  },
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
}
```

**Correction #7 applied.** Explicit `files: ["dist", "icons", "README.md", "LICENSE"]`. npm always includes `package.json`. Sprint 3.2 validates nothing else leaks in.

**Correction #1 applied.** Peer `>=0.8.0 <0.9.0`, dev `0.8.0`. Sprint 0.3/0.4 confirmed values.

**Remove from current package.json:**
- `dependencies.@langchain/openai`
- `dependencies.form-data`
- `overrides.langsmith`

### 2.8 Update Jest tests

- `TokenSenseChatModel.test.ts`: mock `supplyModel` from `@n8n/ai-node-sdk`; assert the `modelConfig` passed (baseUrl ends with `/v1` exactly once, apiKey set, `additionalParams.metadata` matches).
- `TokenSenseAi.test.ts`: mock `this.helpers.httpRequestWithAuthentication` (not `httpRequest`); confirm no manual `x-tokensense-key` headers anywhere.
- `test/utils.test.ts`: add `normalizeBaseUrl` tests (per 2.3).
- Embeddings tests already relocated to `future/` and excluded from discovery (Sprint 1.5 + 2.1).

**Acceptance:**
- `npm run lint` exits 0 on active source
- `npm test` passes (~35-40 tests after embeddings removed)
- No `@langchain/openai`, `form-data`, `langsmith` in `package*.json`
- No manual `x-tokensense-key` or `Authorization` header construction anywhere in `nodes/` or `shared/`

### Sprint 2 Commit Structure

Single PR `Sprint 2: scanner-clean refactor`:
- `chore: relocate TokenSenseEmbeddings to future/ (deferred to v0.2.0)`
- `feat: add authenticate block + /v1 normalization to TokenSenseApi credential`
- `feat: add normalizeBaseUrl helper with tests`
- `feat: migrate TokenSenseChatModel to @n8n/ai-node-sdk supplyModel`
- `refactor: migrate TokenSenseAi to httpRequestWithAuthentication`
- `feat: replace form-data with n8n built-in multipart in transcribeAudio`
- `chore: remove @langchain/openai, form-data, langsmith override`
- `chore: pin @n8n/ai-node-sdk peer range to current n8n runtime (0.8.x)`
- `test: update mocks for scanner-clean node implementations`
- `docs: update README with v0.1.0 scope and endpoint format`

---

## Sprint 3 — Packed Tarball Validation + Publish Prep

**Duration:** ~60-90 min
**Goal:** Green locally, packed, and proven to install + work against a clean n8n runtime. Correction #5 applied — the smoke test is a hard gate, not optional.

### 3.1 Green path

```bash
npm run lint    # must exit 0
npm run build   # clean TypeScript compile
npm test        # all tests pass
npm pack --dry-run --json > /tmp/pack-report.json
```

### 3.2 Tarball content verification

From `/tmp/pack-report.json` confirm INCLUDED:
- `package.json`
- `LICENSE`
- `README.md`
- `dist/nodes/TokenSenseAi/TokenSenseAi.node.js`
- `dist/nodes/TokenSenseChatModel/TokenSenseChatModel.node.js`
- `dist/credentials/TokenSenseApi.credentials.js`
- `dist/icons/tokensense.svg` (if the build hook copies icons) OR `icons/tokensense.svg` (top-level)

Confirm EXCLUDED:
- `node_modules/`
- `.github/`
- `docs/`
- `test/`
- `nodes/` (TypeScript source — only compiled `dist/` should ship)
- `credentials/` (source) — same reasoning
- `shared/` (source) — same reasoning
- `future/`
- `*.test.ts`, `*.test.ts.bak`
- `eslint.config.mjs`, `jest.config.js`, `tsconfig.json` (config files)

Size: expect < 100KB.

### 3.3 Icon resolution check

```bash
npm pack  # produces n8n-nodes-tokensense-0.1.0.tgz
tar -tzf n8n-nodes-tokensense-0.1.0.tgz | grep icons
# expect a path ending in tokensense.svg

tar -xzf n8n-nodes-tokensense-0.1.0.tgz --to-stdout \
  package/dist/nodes/TokenSenseAi/TokenSenseAi.node.js | grep -m1 "icon:"
# expect: icon: 'file:../../icons/tokensense.svg'  OR  icon: 'file:icons/tokensense.svg'
```

If the packed layout and the descriptor's `icon:` path disagree, fix by updating the descriptor to `file:icons/tokensense.svg` (anchored to package root, per n8n docs).

### 3.4 (GATE) Packed-tarball clean-install smoke test — MANDATORY

**Correction #5 applied.** This is a hard gate before tagging v0.1.0.

Preferred — Docker (clean `n8nio/n8n:latest`):

```bash
# From the package dir, with the tarball built:
docker run --rm -d \
  --name n8n-smoke \
  -v "$PWD/n8n-nodes-tokensense-0.1.0.tgz:/tmp/pkg.tgz" \
  -e N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom \
  -p 5678:5678 \
  n8nio/n8n:latest sh -c '
    mkdir -p /home/node/.n8n/custom &&
    cd /home/node/.n8n/custom &&
    npm init -y >/dev/null &&
    npm install /tmp/pkg.tgz &&
    exec n8n start
  '

# Wait for n8n to boot
until curl -fsS http://localhost:5678/healthz >/dev/null 2>&1; do sleep 3; done

# Browser-side verification (Cowork drives via Chrome)
open http://localhost:5678
```

Fallback if Docker Desktop is unavailable — fresh npm install on the Mac:

```bash
mkdir -p /tmp/n8n-smoke && cd /tmp/n8n-smoke
npm init -y >/dev/null
npm install n8n@latest /path/to/n8n-nodes-tokensense-0.1.0.tgz
N8N_CUSTOM_EXTENSIONS="$PWD/node_modules/n8n-nodes-tokensense" npx n8n start
```

**Four sub-gates — all must pass:**

1. **Package installs.** `npm install .../n8n-nodes-tokensense-0.1.0.tgz` exits 0 with no peer-dep errors.
2. **Both nodes appear.** In n8n UI → add node search for "TokenSense": both `TokenSense AI` and `TokenSense Chat Model` are listed. Icons render.
3. **AI Agent + Chat Model sub-node works.** Build: Manual Trigger → AI Agent. Connect `TokenSense Chat Model` to the Agent's Chat Model socket. Create the `TokenSenseApi` credential (endpoint = `https://api.tokensense.io`, valid API key). Run. Agent responds with a chat completion.
   - Verify in TokenSense Dashboard → Logs: a row appears with `source = n8n-nodes-tokensense`, `workflow_tag`, `project`, and `provider`.
4. **TokenSense AI general node works.** Drop a `TokenSense AI` node with the `chatCompletion` operation. Same credential. Run. Output contains completion text.
   - Verify in TokenSense Dashboard → Logs: same metadata fields populated.

**Pass criteria:** all four sub-gates green.
**Fail action:** Stop. Do NOT tag v0.1.0. Diagnose the failing gate, fix, repack, retest.

Record outcome in `docs/audits/sprint-3-smoke-test-2026-04-19.md`.

### 3.5 Package name availability (final check)

```bash
npm view n8n-nodes-tokensense
# Expected: E404 — name available
```

### 3.6 README final polish

Confirm `README.md` covers only what v0.1.0 supports and what's been verified:

- One-liner: what TokenSense is
- **Install (v0.1.0):** "Installable on self-hosted n8n from npm via Settings → Community Nodes → Install → `n8n-nodes-tokensense`." No claim of n8n Cloud availability. No claim about the verified-nodes panel. (Correction #6.)
- Credential setup: endpoint must be bare origin (e.g. `https://api.tokensense.io` — do not include `/v1`); API key from app.tokensense.io/keys
- Quick example: AI Agent workflow with TokenSense Chat Model sub-node
- Quick example: general TokenSense AI node (chat completion)
- Embeddings story for v0.1.0: use `TokenSense AI` general node's Embeddings operation (or HTTP Request). Native LangChain Embeddings sub-node arrives in v0.2.0.
- Link to github.com/TheYote12/n8n-nodes-tokensense
- License (MIT)

### 3.7 Dry-run publish

```bash
npm whoami
npm publish --provenance --access public --dry-run
```

Confirm name, version, file list, provenance enabled.

---

## Carlo's Manual Steps

Already complete as of 2026-04-19:

- ✅ GitHub PAT `carlo-ops-dashboard-v2` has `workflow` scope
- ✅ npm Granular Access Token created with Bypass-2FA, 30-day expiry
- ✅ `NPM_TOKEN` added to GitHub repo secrets (`gh secret list` shows 2026-04-19T04:33:18Z)

**Trusted Publishers migration — deferred to v0.2.0** (same as v3):

1. After v0.1.0 ships, npmjs.com → package settings → Trusted Publishers
2. Add GitHub Actions trusted publisher for `TheYote12/n8n-nodes-tokensense`, workflow `publish.yml`
3. Update `publish.yml` to remove `NPM_TOKEN` step, rely on OIDC alone
4. Rotate/delete the `NPM_TOKEN` secret
5. Ship v0.1.1 or v0.2.0 via Trusted Publishers to confirm

---

## Publish Procedure

Only proceed once Sprint 0 (all 3 gates) + Sprint 2 PR merged + Sprint 3.4 smoke test (all 4 sub-gates) are green.

```bash
gh pr merge <sprint-2-pr-number> --squash
git checkout main && git pull
git tag v0.1.0
git push origin v0.1.0
gh run watch
```

`.github/workflows/publish.yml` runs: `npm ci` → `npm run lint` → `npm run build` → `npm test` → `npm publish --provenance --access public` (auth via `NPM_TOKEN`).

Success = `https://www.npmjs.com/package/n8n-nodes-tokensense` with provenance badge.

**If publish fails:**
- Auth → check `NPM_TOKEN` secret and `registry-url` in workflow
- Provenance → confirm `permissions: id-token: write` in workflow
- Version collision → bump to `0.1.1` and retag
- Test failure → fix on `main`, delete tag (`git tag -d v0.1.0 && git push --delete origin v0.1.0`), retag

---

## Post-Publish

### Immediate

1. Run `npx @n8n/scan-community-package n8n-nodes-tokensense` — archive output. **Scanner run is informational. Verified status for AI nodes requires confirmation from n8n — not assumed for v0.1.0.** (Correction #6.)
2. Install from npm directly (`npm install n8n-nodes-tokensense@0.1.0` into a fresh n8n) → verify the live published package works identically to the pre-publish tarball.
3. Create an AI Agent workflow using TokenSense Chat Model → verify ICP scenario end-to-end.

### Within 48 hours

4. Add "Install Community Node" section to TokenSense Connect page (`Dashboard/app/(dashboard)/connect`) — framing: "self-hosted n8n users, install from Community Nodes UI".
5. Update `/Users/carlo/Documents/SecondBrain/01 Projects/TokenSense/n8n Community Node.md` — status `published-v0.1.0`, add npm + provenance links.
6. Update `docs/STATUS.md` on `tokensense` repo.
7. Memory: mark `project_n8n_integration_gap.md` resolved.

### Within 1 week

8. Post to n8n community forum (AI Gateway thread + showcase).
9. Tweet/LinkedIn announcement.
10. Blog post on tokensense.io/blog.
11. Plan v0.2.0 sprint: embeddings + Trusted Publishers migration.

---

## Open Risks

### R1 — `n8n-node-cli` build/lint behaviour differs from assumed flat-config
**Probability:** Low-Medium
**Impact:** +30-60 min
**Mitigation:** If `n8n-node lint` imposes its own config and rejects our `eslint.config.mjs`, drop `@n8n/node-cli` and run `eslint` + `tsc` directly via scripts.

### R2 — `additionalParams.metadata` is filtered by SDK 0.8.x before reaching the wire
**Probability:** Low-Medium (API has drifted from 0.4.x; Sprint 0.5 is the dedicated check)
**Impact:** Blocks v0.1.0. Not patched in-sprint — stop and re-plan (per correction #8).
**Mitigation:** Sprint 0.2 + 0.5 catch this before Sprint 1. If the field was renamed in 0.8.x, the grep in 0.5 reveals the new name.

### R3 — Multipart upload via `httpRequestWithAuthentication`
**Probability:** Low-Medium
**Impact:** +1 hour
**Mitigation:** Three-step fallback ladder in § 2.6.

### R4 — Scanner rejects the published tarball for a rule we didn't catch
**Probability:** Low (we replicate the exact lint config used by the scanner)
**Impact:** +1-2 hours to fix + republish as `0.1.1`
**Mitigation:** Sprint 3.4 smoke test (MANDATORY) catches install-time surprises. If Carlo wants extra belt-and-braces, ship `0.1.0-beta.1` first.

### R5 — Icon path breaks after `npm pack`
**Probability:** Low
**Impact:** Cosmetic
**Mitigation:** Sprint 3.3 verifies.

### R6 — n8n-workflow peer too tight
**Probability:** Low
**Impact:** Install warning on older n8n
**Mitigation:** Relax range in a patch release if users report.

### R7 — `@n8n/ai-node-sdk` bumps to 0.9.x before we ship v0.1.0
**Probability:** Medium (0.8.0 is only 6 days old; n8n is on a fast SDK cadence)
**Impact:** Peer-dep warning for users on newer n8n. Not a blocker — v0.1.0 still loads.
**Mitigation:** Re-run Sprint 0.3/0.4 on the day of publish. If 0.9.x has shipped and n8n has adopted it, widen peer to `">=0.8.0 <0.10.0"` after re-verifying `additionalParams` still exists in 0.9.x. Target a same-day v0.1.1 if widening is needed post-publish.

### R8 — n8n expression engine rejects chained `.replace()` in credential-test `baseURL`
**Probability:** Medium
**Impact:** Credential test URL becomes `/v1/v1/models` for users who paste `/v1` — declarative test fails even when credentials are correct
**Mitigation:** If Sprint 2.2's expression fails, fall back to enforcing bare-origin input via `typeOptions.regexp` on the `endpoint` property + description copy. `normalizeBaseUrl()` still protects runtime calls — only the credential-test URL is affected.

### R9 — Sprint 3.4 smoke test can't run (no Docker + no fresh-npm runner on the Mac)
**Probability:** Low
**Impact:** v0.1.0 cannot be tagged until smoke test runs somewhere
**Mitigation:** Either install Docker Desktop OR run the fallback (`npm install n8n@latest` + `N8N_CUSTOM_EXTENSIONS`) on Carlo's Mac. Correction #5 makes this a hard gate — no publishing without it.

---

## Success Criteria

- [ ] Sprint 0 (3 gates) all pass, documented in `docs/audits/sprint-0-feasibility-2026-04-19.md`
- [ ] `n8n-nodes-tokensense@0.1.0` published to npm with provenance badge
- [ ] Package installable from npm on self-hosted n8n (**not claiming Cloud / verified-panel availability**)
- [ ] `TokenSense Chat Model` connects to AI Agent and executes tool-calling workflows
- [ ] `TokenSense AI` passes all 8 operations end-to-end
- [ ] Metadata (`source`, `project`, `workflow_tag`, `provider`) arrives in TokenSense logs for every call
- [ ] Zero external runtime dependencies (`"dependencies": {}`)
- [ ] Zero manual `x-tokensense-key` or `Authorization` header construction in source
- [ ] `npm pack` tarball contains only `dist`, `icons`, `README.md`, `LICENSE`, `package.json`; `future/` excluded
- [ ] Sprint 3.4 packed-tarball smoke test passes (all 4 sub-gates)
- [ ] CI green
- [ ] SecondBrain vault + `docs/STATUS.md` updated
- [ ] v0.2.0 follow-up ticket opened for custom `BaseChatModel` (only if needed by future metadata patterns) + embeddings + Trusted Publishers

**North-star post-publish (within 30 days):**
- First 5 external users install from npm on self-hosted n8n
- Zero Critical/High security issues reported
- Blog + forum drive >500 tokensense.io visits from n8n ecosystem
