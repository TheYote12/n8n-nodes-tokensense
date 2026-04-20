# npm Publish & n8n Verification Readiness Plan

> **Status:** Draft
> **Created:** 2026-04-11
> **Target version:** 0.1.0
> **Goal:** Eliminate all blockers so `npm publish` succeeds and the package passes `npx @n8n/scan-community-package`.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Gap 1 — Eliminate Runtime Dependencies](#gap-1--eliminate-runtime-dependencies)
3. [Gap 2 — Linting Setup](#gap-2--linting-setup)
4. [Gap 3 — npm Account & Token](#gap-3--npm-account--token)
5. [Implementation Order](#implementation-order)
6. [Risks & Open Decisions](#risks--open-decisions)

---

## Executive Summary

Three gaps block publish + verification:

| Gap | Severity | Complexity | Summary |
|-----|----------|------------|---------|
| 1 — Runtime deps | **Blocking** | Large | `@langchain/openai` and `form-data` must be removed from `dependencies` |
| 2 — Linting | **Blocking** | Small | No lint step; scanner will flag issues we can catch locally |
| 3 — npm account | **Blocking** | Small | Manual setup: npm account, token, GitHub secret |

### Scanner Rules We Must Pass

The `@n8n/eslint-plugin-community-nodes` (run by `npx @n8n/scan-community-package`) enforces:

| Rule | Current Status |
|------|---------------|
| `no-restricted-imports` | **FAIL** — `@langchain/openai`, `form-data` not on allowlist |
| `no-restricted-globals` | **FAIL** — `globalThis.fetch` used in `TokenSenseEmbeddings.node.ts:101` |
| `credential-password-field` | Likely pass (apiKey uses password type) |
| `credential-test-required` | Pass (test request defined) |
| `icon-validation` | Pass |
| `package-name-convention` | Pass (`n8n-nodes-tokensense`) |
| `no-deprecated-workflow-functions` | Likely pass |
| `node-usable-as-tool` | Needs check |

**Allowed imports (exhaustive allowlist):**
`n8n-workflow`, `@n8n/ai-node-sdk`, `ai-node-sdk`, `lodash`, `moment`, `p-limit`, `luxon`, `zod`, `crypto`, `node:crypto`, and relative imports (`./`, `../`).

Everything else — including `@langchain/openai`, `@langchain/core`, `form-data`, `openai`, `axios` — is **blocked**.

---

## Gap 1 — Eliminate Runtime Dependencies

This is the most complex gap. We have two dependencies to remove:

### 1A. Replace `@langchain/openai` with `@n8n/ai-node-sdk`

**Complexity:** Medium
**Files affected:** `nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts`, `nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts`, `package.json`

#### Background

`@n8n/ai-node-sdk` (v0.4.1 stable, v0.7.0 beta) is on the scanner allowlist. It provides:

- **`supplyModel(ctx, model)`** — wraps a model config into `SupplyData` with full LangChain compatibility
- **Simple OpenAI-compatible pattern** — pass `{ type: 'openai', baseUrl, apiKey, model, ... }` and the SDK internally creates a `ChatOpenAI` instance
- **Advanced pattern** — extend `BaseChatModel` for custom providers

The SDK does **NOT** yet have an embeddings equivalent (`supplyEmbeddings()`). See Task 1A-2 for the embeddings strategy.

#### Task 1A-1: Rewrite `TokenSenseChatModel` to use `@n8n/ai-node-sdk`

**Current code** (`nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts:111-121`):
```typescript
import { ChatOpenAI } from '@langchain/openai';

const chatModel = new ChatOpenAI({
  model,
  temperature,
  streaming,
  ...(maxTokens > 0 ? { maxTokens } : {}),
  configuration: {
    baseURL: `${credentials.endpoint as string}/v1`,
    apiKey: credentials.apiKey as string,
  },
  modelKwargs: { metadata },
});
return { response: chatModel };
```

**New code pattern:**
```typescript
import { supplyModel } from '@n8n/ai-node-sdk';
import type { OpenAiModel } from '@n8n/ai-node-sdk';

const modelConfig: OpenAiModel = {
  type: 'openai',
  model,
  baseUrl: `${credentials.endpoint as string}/v1`,
  apiKey: credentials.apiKey as string,
  temperature,
  ...(maxTokens > 0 ? { maxTokens } : {}),
  streaming,
  extraBody: { metadata },   // equivalent to modelKwargs
};
return supplyModel(this, modelConfig);
```

**Steps:**
1. Replace the `@langchain/openai` import with `@n8n/ai-node-sdk` imports
2. Replace `new ChatOpenAI(...)` constructor with `OpenAiModel` config object
3. Replace `return { response: chatModel }` with `return supplyModel(this, modelConfig)`
4. Map `modelKwargs` to `extraBody` (verify this field name in the SDK source — it may be `modelKwargs`, `extraBody`, or require using the advanced `BaseChatModel` pattern)
5. Verify streaming still works

**Acceptance criteria:**
- No `@langchain/openai` import in the file
- Node still appears as `ai_languageModel` output
- Can be connected to an AI Agent node in n8n
- Metadata (project, workflow_tag, provider) is still sent in requests

**Risk — metadata injection:** The simple `OpenAiModel` pattern may not support `modelKwargs`/`extraBody`. If not, we need the advanced pattern: extend `BaseChatModel`, implement `generate()` and `stream()` methods that make HTTP calls to TokenSense with metadata, and pass the instance to `supplyModel()`. This is a larger lift but gives full control.

**Fallback — advanced `BaseChatModel` pattern:**
```typescript
import { BaseChatModel, supplyModel } from '@n8n/ai-node-sdk';
import type { Message, GenerateResult } from '@n8n/ai-node-sdk';

class TokenSenseChatModelProvider extends BaseChatModel {
  private endpoint: string;
  private apiKey: string;
  private modelName: string;
  private temperature: number;
  private metadata: Record<string, string>;

  constructor(config: { endpoint: string; apiKey: string; model: string; temperature: number; metadata: Record<string, string> }) {
    super();
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.modelName = config.model;
    this.temperature = config.temperature;
    this.metadata = config.metadata;
  }

  async generate(messages: Message[]): Promise<GenerateResult> {
    // Direct HTTP POST to ${this.endpoint}/v1/chat/completions
    // Include metadata in request body
    // Parse OpenAI-format response into GenerateResult
  }

  async *stream(messages: Message[]): AsyncGenerator<StreamChunk> {
    // SSE streaming via parseSSEStream utility
  }
}
```

#### Task 1A-2: Rewrite `TokenSenseEmbeddings` — strategy decision needed

**Current code** (`nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts:101-123`):
```typescript
import { OpenAIEmbeddings } from '@langchain/openai';

const nativeFetch = globalThis.fetch;  // <-- RESTRICTED GLOBAL
const metadataInjectingFetch = async (url, init) => { ... };

const embeddings = new OpenAIEmbeddings({
  model,
  ...(dimensions > 0 ? { dimensions } : {}),
  configuration: {
    baseURL: `${credentials.endpoint as string}/v1`,
    apiKey: credentials.apiKey as string,
    fetch: metadataInjectingFetch,
  },
});
return { response: embeddings };
```

**Problems:**
1. `OpenAIEmbeddings` from `@langchain/openai` — blocked import
2. `globalThis.fetch` — restricted global (`no-restricted-globals` rule)
3. `@n8n/ai-node-sdk` has **no embeddings abstraction** yet

**Options (decision needed from Carlo):**

**Option A: Drop the Embeddings node from v0.1.0** (recommended for fastest publish)
- Remove `TokenSenseEmbeddings` from `package.json` n8n.nodes array
- Keep the source file but don't register it
- Add it back when `@n8n/ai-node-sdk` adds `supplyEmbeddings()`
- Pro: Unblocks publish immediately
- Con: Loses embeddings functionality

**Option B: Rewrite as a regular execute node that returns embedding vectors as JSON**
- Instead of outputting `ai_embedding` (which requires a LangChain Embeddings object), output regular JSON data with the embedding array
- Users would need to manually wire this into vector stores
- Pro: No LangChain dependency needed
- Con: Loses native RAG pipeline integration (can't plug into n8n Vector Store nodes directly)

**Option C: Implement a minimal Embeddings class that satisfies the LangChain interface**
- n8n's vector store nodes expect an object matching `@langchain/core/embeddings.Embeddings`
- We could implement this interface from scratch using only allowed imports
- The interface requires: `embedDocuments(texts: string[]): Promise<number[][]>` and `embedQuery(text: string): Promise<number[]>`
- Pro: Full RAG compatibility preserved
- Con: We're reimplementing the LangChain interface; the scanner might flag the `ai_embedding` output type if it expects the object to come from a known source
- **Critical question:** Does the scanner validate the _runtime type_ of supply-data outputs, or just the import statements? If it only checks imports, this approach works.

**Option D: Check if `@n8n/ai-node-sdk` v0.7.0-beta has embeddings**
- The beta (0.7.0, published 2026-04-07) may have added this
- If so, use it and pin to the beta version
- Pro: Official path
- Con: Beta stability risk

**Recommendation:** Start with Option D (check beta). If no embeddings support, go with Option A for v0.1.0 and add embeddings in v0.2.0. Option C is the fallback if Carlo insists on shipping embeddings in v0.1.0.

#### Task 1A-3: Update `package.json` — remove `@langchain/openai`

**Steps:**
1. Remove `"@langchain/openai": "^0.5.13"` from `dependencies`
2. Remove `"langsmith": "^0.5.16"` from `overrides` (only needed for langchain)
3. Add `"@n8n/ai-node-sdk": ">=0.4.1"` to `peerDependencies`
4. Add `"@n8n/ai-node-sdk": "^0.4.1"` to `devDependencies` (for local development/testing)

**Resulting package.json dependencies section:**
```json
{
  "dependencies": {},
  "peerDependencies": {
    "n8n-workflow": ">=1.0.0",
    "@n8n/ai-node-sdk": ">=0.4.1"
  },
  "devDependencies": {
    "@n8n/ai-node-sdk": "^0.4.1",
    "@types/jest": "^30.0.0",
    "@types/node": "^20.19.37",
    "jest": "^30.3.0",
    "n8n-workflow": "^2.13.1",
    "ts-jest": "^29.4.9",
    "typescript": "^5.7.3"
  }
}
```

### 1B. Replace `form-data` with n8n's built-in HTTP helpers

**Complexity:** Small
**File affected:** `nodes/TokenSenseAi/TokenSenseAi.node.ts` (lines 9, 652-663)

#### Background

The `form-data` package is used only in the `transcribeAudio` operation to construct a multipart/form-data request for audio file upload. n8n's `this.helpers.httpRequest` supports multipart uploads natively via the `formData` option.

#### Task 1B-1: Replace `form-data` with `this.helpers.httpRequest` multipart

**Current code** (`nodes/TokenSenseAi/TokenSenseAi.node.ts:652-665`):
```typescript
import FormData from 'form-data';

const formBody = new FormData();
formBody.append('file', Buffer.from(binaryBuffer), { filename: fileName, contentType: mimeType });
formBody.append('model', model);
formBody.append('response_format', responseFormat);
if (language) formBody.append('language', language);
formBody.append('metadata', JSON.stringify(metadata));

const response = await this.helpers.httpRequest({
  method: 'POST',
  url: `${endpoint}/v1/audio/transcriptions`,
  headers: { 'x-tokensense-key': apiKey, ...formBody.getHeaders() },
  body: formBody,
  returnFullResponse: true,
});
```

**New code pattern using `this.helpers.httpRequest` with `formData`:**
```typescript
// No import needed — uses n8n built-in multipart support

const response = await this.helpers.httpRequest({
  method: 'POST',
  url: `${endpoint}/v1/audio/transcriptions`,
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

**Alternative — if `contentType: 'multipart-form-data'` with nested objects isn't supported:**
Use `this.helpers.httpRequestWithAuthentication` or construct the multipart boundary manually. Another option is `this.helpers.requestWithAuthentication` which wraps the `request` library that supports `formData` natively.

**Steps:**
1. Remove `import FormData from 'form-data';` (line 9 of TokenSenseAi.node.ts)
2. Replace the `FormData` construction block with the `contentType: 'multipart-form-data'` pattern
3. Remove `form-data` from `dependencies` in `package.json`
4. Test audio transcription end-to-end

**Acceptance criteria:**
- No `form-data` import anywhere in the codebase
- `form-data` removed from `package.json` dependencies
- Audio transcription still works (multipart upload with file + metadata)
- The `Content-Type` header with boundary is auto-generated

#### Task 1B-2: Remove `form-data` from `package.json`

Remove `"form-data": "^4.0.2"` from `dependencies`.

### 1C. Fix restricted globals

**Complexity:** Small
**File affected:** `nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts` (line 101)

**Current code:**
```typescript
const nativeFetch = globalThis.fetch;
```

This uses `globalThis` which is blocked by the `no-restricted-globals` rule.

**Fix:** This is resolved by the broader embeddings rewrite (Task 1A-2). If we drop the embeddings node (Option A) or rewrite it (Options B/C/D), this line goes away. If for any reason we keep it, replace `globalThis.fetch` with `fetch` (the bare global) — but note that `globalThis` specifically is what's blocked, and bare `fetch` may still work. **Verify against the exact rule implementation.**

### 1D. Verify zero dependencies

**After all changes, `package.json` must have:**
```json
"dependencies": {}
```

Or simply omit the `dependencies` field entirely.

**Verification command:**
```bash
npm pack --dry-run 2>&1 | head -20
# Check that no node_modules are bundled

# After publishing to npm (or using verdaccio locally):
npx @n8n/scan-community-package n8n-nodes-tokensense
```

---

## Gap 2 — Linting Setup

**Complexity:** Small
**Files affected:** `package.json`, new `eslint.config.mjs`

### Background

Two complementary ESLint plugins exist:
1. **`@n8n/eslint-plugin-community-nodes`** — the scanner plugin (restricted imports/globals, credential checks)
2. **`eslint-plugin-n8n-nodes-base`** — structural checks (display names, descriptions, parameter conventions)

The official `n8n-nodes-starter` template uses `@n8n/node-cli` for build tooling and ESLint 9 flat config.

### Task 2A: Install linting dependencies

Add to `devDependencies`:
```json
{
  "eslint": "^9.0.0",
  "@n8n/eslint-plugin-community-nodes": "^1.0.0",
  "eslint-plugin-n8n-nodes-base": "^1.16.2",
  "@typescript-eslint/parser": "^8.0.0"
}
```

**Note:** Check the actual published version of `@n8n/eslint-plugin-community-nodes` on npm. It may be bundled inside `@n8n/node-cli` or published separately. If not published separately, install `@n8n/node-cli` as a devDependency instead:
```json
{
  "@n8n/node-cli": "^0.23.0"
}
```

### Task 2B: Create `eslint.config.mjs`

Create a flat-config ESLint configuration:

```javascript
// eslint.config.mjs
import n8nCommunityNodes from '@n8n/eslint-plugin-community-nodes';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@n8n/community-nodes': n8nCommunityNodes,
      'n8n-nodes-base': n8nNodesBase,
    },
    rules: {
      // Community node scanner rules (must pass for verification)
      ...n8nCommunityNodes.configs.recommended.rules,
      // Structural rules
      ...n8nNodesBase.configs.nodes.rules,
    },
  },
  {
    files: ['credentials/**/*.ts'],
    rules: {
      ...n8nNodesBase.configs.credentials.rules,
    },
  },
];
```

**Note:** The exact plugin import paths and config shapes depend on the published versions. Verify by reading each plugin's README after install. The starter template (`n8n-io/n8n-nodes-starter`) has a working example to reference.

### Task 2C: Add lint scripts to `package.json`

```json
{
  "scripts": {
    "lint": "eslint nodes/ credentials/",
    "lint:fix": "eslint --fix nodes/ credentials/",
    "build": "npx tsc",
    "postbuild": "cp -r icons dist/icons",
    "prepublishOnly": "npm run lint && npm run build",
    "test": "jest"
  }
}
```

Key changes:
- Add `lint` and `lint:fix` scripts
- Add `npm run lint` to `prepublishOnly` so lint runs before every publish

### Task 2D: Add lint to CI workflow

Update `.github/workflows/ci.yml`:
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
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

### Task 2E: Fix any lint errors

After setting up the linter, run `npm run lint` and fix all reported issues. Common expected findings:
- Restricted import violations (caught early, before we fix Gap 1)
- Parameter naming conventions
- Description formatting
- Missing `usableAsTool` configuration (check `node-usable-as-tool` rule)

**Acceptance criteria:**
- `npm run lint` exits 0 after all Gap 1 fixes are applied
- CI runs lint on every push/PR
- `prepublishOnly` runs lint before build

---

## Gap 3 — npm Account & Token

**Complexity:** Small
**Owner:** Carlo (manual steps)

### Task 3A: Verify npm account

1. Log in to [npmjs.com](https://www.npmjs.com/) (or create an account)
2. Enable 2FA (required for publishing)

### Task 3B: Verify package name availability

```bash
npm view n8n-nodes-tokensense
# Should return 404 / "Not Found" if available
```

If the name is taken, choose an alternative (e.g., `@tokensense/n8n-nodes` as a scoped package — but scoped packages require `--access public` on first publish, which our workflow already has).

### Task 3C: Generate npm access token

**Option A — Granular Access Token (simpler):**
1. Go to npmjs.com → Access Tokens → Generate New Token → Granular Access Token
2. Name: `github-actions-publish`
3. Expiration: 365 days (set a calendar reminder)
4. Packages: Read and write — select `n8n-nodes-tokensense` (or "All packages" initially since the package doesn't exist yet)
5. Organizations: No access needed
6. Copy the token immediately (shown only once)

**Option B — OIDC Trusted Publishing (more secure, no stored secret):**
1. The publish workflow already has `permissions: id-token: write`
2. Configure npm to trust GitHub Actions for this repo
3. See [npm docs on OIDC](https://docs.npmjs.com/generating-provenance-statements)
4. This eliminates the need for `NPM_TOKEN` secret entirely

**Recommendation:** Start with Option A (Granular Access Token) for simplicity. Migrate to OIDC later.

### Task 3D: Add `NPM_TOKEN` to GitHub repo secrets

1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. New repository secret:
   - Name: `NPM_TOKEN`
   - Value: (paste the token from Task 3C)

### Task 3E: Test publish workflow

```bash
# First publish (from local, to verify everything works):
npm login
npm publish --provenance --access public --dry-run

# If dry-run looks good, either:
# a) Push a v0.1.0 tag to trigger the GitHub Action
git tag v0.1.0
git push origin v0.1.0

# b) Or publish manually:
npm publish --provenance --access public
```

**Acceptance criteria:**
- `npm view n8n-nodes-tokensense` returns package metadata after publish
- GitHub Actions publish workflow succeeds on tag push
- Package appears on npmjs.com with provenance badge

---

## Implementation Order

Execute in this order (some tasks can be parallelized):

```
Phase 1: Setup (do first, provides fast feedback loop)
├── Task 2A: Install linting dependencies
├── Task 2B: Create eslint.config.mjs
├── Task 2C: Add lint scripts
└── Task 2D: Add lint to CI
    ↓
Phase 2: Dependency elimination (largest effort)
├── Task 1A-1: Rewrite TokenSenseChatModel → @n8n/ai-node-sdk
├── Task 1A-2: Resolve TokenSenseEmbeddings strategy (decision needed)
├── Task 1A-3: Update package.json (remove @langchain/openai)
├── Task 1B-1: Replace form-data with built-in multipart
├── Task 1B-2: Remove form-data from package.json
└── Task 1C: Fix restricted globals (if embeddings node kept)
    ↓
Phase 3: Verification
├── Task 2E: Fix remaining lint errors
├── Task 1D: Verify zero dependencies
└── Run full test suite
    ↓
Phase 4: Publish prep (Carlo manual)
├── Task 3A: Verify npm account
├── Task 3B: Check package name
├── Task 3C: Generate access token
├── Task 3D: Add GitHub secret
└── Task 3E: Test publish
```

**Phases 1-3 estimated at ~3-4 hours of implementation time (for Claude to execute).**
**Phase 4 is ~15 minutes of Carlo's manual setup.**

---

## Risks & Open Decisions

### Decision Required: Embeddings Node Strategy

**Decision for Carlo:** What to do with `TokenSenseEmbeddings` for v0.1.0?

| Option | Ship in v0.1.0? | RAG compatible? | Effort | Risk |
|--------|-----------------|-----------------|--------|------|
| A: Drop from v0.1.0 | No | N/A | None | Loses feature |
| B: Regular JSON node | Yes | No (manual wiring) | Small | Confusing UX |
| C: Custom Embeddings class | Yes | Yes | Medium | May not pass scanner |
| D: Use SDK beta | Yes | Depends | Small | Beta instability |

**Recommendation:** Option A (drop for v0.1.0) unless the SDK beta has embeddings support.

### Risk: `@n8n/ai-node-sdk` Preview Status

The SDK README states: *"Preview: This package is in preview. The API may change without notice. AI nodes are not yet accepted for verification."*

This means:
1. The API surface may change between versions — pin to a specific version
2. **AI nodes may not yet be accepted for n8n Creator Portal verification** even with the SDK

**Mitigation:** This doesn't block npm publish — it only affects Creator Portal submission. We can publish to npm and have users install via `n8n-nodes-tokensense` in the community nodes UI. Creator Portal verification can happen once n8n opens AI node verification.

### Risk: `supplyModel` metadata injection

The simple `OpenAiModel` pattern in `@n8n/ai-node-sdk` may not support injecting custom metadata into request bodies (our `modelKwargs: { metadata }` pattern). We need to verify this by:
1. Reading the SDK source for `supplyModel` / `getOpenAiModel`
2. Checking if `extraBody`, `modelKwargs`, or similar is supported
3. If not, fall back to the advanced `BaseChatModel` pattern

### Risk: Multipart upload replacement

The `this.helpers.httpRequest` multipart support needs to be validated. Specifically:
- Can it send a `Buffer` as a file field with custom filename and content type?
- Does it auto-generate the `Content-Type: multipart/form-data; boundary=...` header?
- Test with a real audio file against the TokenSense API

### Risk: Scanner pre-publish testing

The scanner (`npx @n8n/scan-community-package`) runs against a **published npm package**, not local source. We cannot fully validate scanner results before the first publish. Mitigation:
- Local ESLint with the same rules catches ~90% of issues
- Use `npm pack` + `npx @n8n/scan-community-package ./n8n-nodes-tokensense-0.1.0.tgz` if the scanner accepts local tarballs
- Alternatively, publish as `0.1.0-beta.1` first, scan it, fix issues, then publish `0.1.0`

### Low Risk: Test updates

Tests in `test/` mock n8n interfaces. After rewriting nodes:
- `TokenSenseChatModel.test.ts` needs updated mocks (no more `ChatOpenAI` constructor)
- `TokenSenseEmbeddings.test.ts` needs updates or removal (depending on embeddings strategy)
- `TokenSenseAi.test.ts` needs updated multipart assertions (no more `FormData`)
