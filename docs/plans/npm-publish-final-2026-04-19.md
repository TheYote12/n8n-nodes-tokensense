# npm Publish — Final Plan

> **Status:** Approved 2026-04-19
> **Supersedes:** `docs/plans/npm-publish-readiness-plan.md` (2026-04-11)
> **Target version:** `0.1.0`
> **Publish path:** Scanner-clean (Path B)
> **Embeddings strategy:** Option A — defer to v0.2.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What Changed Since the Previous Plan](#what-changed-since-the-previous-plan)
3. [Competitive Context](#competitive-context)
4. [Embeddings Decision — Research Outcome](#embeddings-decision--research-outcome)
5. [Sprint 1 — Linting Foundation](#sprint-1--linting-foundation)
6. [Sprint 2 — Dependency Elimination](#sprint-2--dependency-elimination)
7. [Sprint 3 — Last Pass + Publish Prep](#sprint-3--last-pass--publish-prep)
8. [Carlo's Manual Steps (Gap 3)](#carlos-manual-steps-gap-3)
9. [Last-Pass Checklist (Pre-Tag)](#last-pass-checklist-pre-tag)
10. [Publish Procedure](#publish-procedure)
11. [Post-Publish](#post-publish)
12. [Open Risks](#open-risks)
13. [Success Criteria](#success-criteria)

---

## Executive Summary

Ship `n8n-nodes-tokensense@0.1.0` to npm, scanner-clean, with:
- `TokenSense Chat Model` sub-node (AI Agent `ai_languageModel` output)
- `TokenSense AI` general node (8 operations: chat, image, embeddings via general call, TTS, STT, native Anthropic, native Gemini, list models)
- `TokenSenseApi` credential (endpoint + API key with declarative test via `GET /v1/models`)

Defer:
- `TokenSense Embeddings` sub-node → v0.2.0 (confirmed: `@n8n/ai-node-sdk` has no embeddings support at stable 0.4.1, beta 0.7.0, or master)

Three sprints, ~4-6 hours of Claude Code execution + ~30 min of Carlo manual setup (PAT + npm token).

---

## What Changed Since the Previous Plan

The 2026-04-11 plan is still directionally correct. Since then:

- **PR #3 merged (2026-04-13ish):** Sprint 1 — metadata parsing, embeddings UX polish, auto-tag, Gemini fix. Did NOT remove `@langchain/openai` or `form-data`.
- **PR #4 merged:** Refactor — shared `buildMetadata()` and `loadModels()` utilities in `shared/utils.ts`. This simplifies the Sprint 2 refactor below because metadata construction is already centralized.
- **Commit `e607d1a`:** Added Imagen 4, Flux 2, GPT Image 1.5/Mini to the image model dropdown (stays in v0.1.0).
- **Locally untracked:** `.github/workflows/ci.yml`, `.github/workflows/publish.yml`, `docs/plans/npm-publish-readiness-plan.md`, and this file. These exist only in the working tree because the GitHub PAT `workflow` scope blocker prevents `git push` on workflow files.
- **Verified against current source (2026-04-19):**
  - `@langchain/openai` still imported: `nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts:9`, `nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts:9`
  - `form-data` still imported: `nodes/TokenSenseAi/TokenSenseAi.node.ts:9`
  - `globalThis.fetch` still used: `nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts:101-102`
  - No `eslint.config.mjs`, no lint script, no lint in CI.

---

## Competitive Context

**Research date: 2026-04-19.**

| Player | n8n Community Node | Chat Model sub-node? | Embeddings? | Notes |
|--------|-------------------|---------------------|-------------|-------|
| Portkey | **None** | N/A | N/A | Docs tell users to override base URL on n8n's built-in OpenAI Chat Model. Exact workaround TokenSense replaces. |
| Helicone | **None** | N/A | N/A | Observability-first. Integrates via OpenAI node base URL override. Acquired Q1 2026. |
| OpenRouter | `n8n-nodes-openrouter` (Matthew Sabia, 25 stars, 6 commits) | **No** — general node only | No | Indie maintainer, not OpenRouter official. One "Chat" operation. |
| LiteLLM | `litellm-n8n-node` (paulokuong, 0 stars, 3 commits) | **No** — general node only | No | Tiny indie package. Single `acompletion` operation. |
| n8n itself | AI Gateway (v2.17.0, shipped 2026-04-13/14) | N/A — managed credentials | N/A | Feature-flagged. Credential management only (short-lived JWT). Not routing/budgets/costs. |

**Category position:** TokenSense is the only AI-gateway-class product shipping a proper `ai_languageModel` sub-node on n8n. This is the moat to protect at publish time. The quality of the v0.1.0 publish must match or exceed industry-standard hygiene (zero deps, scanner-clean) to avoid undercutting the moat.

**Positioning angle for the announcement:** *"The only n8n AI Gateway with a Chat Model sub-node. Install, drop into your AI Agent, done. No base URL hacks. Routing, cost tracking, budgets, multi-provider failover — the layer n8n's AI Gateway doesn't provide."*

---

## Embeddings Decision — Research Outcome

**Option D investigation complete (2026-04-19):**

Examined `@n8n/ai-node-sdk` at:
- Stable `0.4.1` — no embeddings
- Beta `0.7.0-beta` — no embeddings
- Master (GitHub) — no embeddings

Current exports from `packages/@n8n/ai-node-sdk/src/index.ts`:
```
parseSSEStream, getParametersJsonSchema, supplyMemory, supplyModel,
BaseChatModel, BaseChatHistory, BaseChatMemory, WindowedChatMemory
```

No `supplyEmbeddings`, no `BaseEmbeddings`, no embedding types anywhere.

**Decision: Option A — drop `TokenSenseEmbeddings` from v0.1.0.**
- Remove from `package.json` `n8n.nodes[]` array
- Keep source file in repo (not registered) for v0.2.0 reuse
- README note: *"Embeddings node coming in v0.2.0. For now, use n8n's HTTP Request node pointed at your TokenSense endpoint `/v1/embeddings`, or use the TokenSense AI general node's Embeddings operation."*

**v0.2.0 path (post-publish):** Implement `TokenSenseEmbeddings` as a custom class satisfying the LangChain `Embeddings` interface shape (`embedDocuments`, `embedQuery`) using only allowed imports. If the SDK ships `supplyEmbeddings()` by then, pivot to that.

---

## Sprint 1 — Linting Foundation

**Duration:** ~45-60 min
**Goal:** Catch all restricted imports/globals locally before refactoring. Fail fast.

### Tasks

**1.1 Install dev dependencies**

```bash
npm install --save-dev \
  eslint@^9.0.0 \
  @n8n/eslint-plugin-community-nodes@latest \
  eslint-plugin-n8n-nodes-base@^1.16.2 \
  @typescript-eslint/parser@^8.0.0
```

Verify `@n8n/eslint-plugin-community-nodes` is published as a standalone package (it was split from `@n8n/scan-community-package` per PR n8n-io/n8n#19660). If not published standalone, install `@n8n/node-cli@^0.23.0` instead, which bundles it.

**1.2 Create `eslint.config.mjs`** (flat config, ESLint 9):

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
    ignores: ['dist/**', 'node_modules/**', 'test/**', 'docs/**'],
  },
];
```

Adjust plugin import names after install by reading each plugin's README — the exact export shape may differ.

**1.3 Update `package.json` scripts:**

```json
{
  "scripts": {
    "build": "npx tsc",
    "postbuild": "cp -r icons dist/icons",
    "lint": "eslint nodes/ credentials/ shared/",
    "lint:fix": "eslint --fix nodes/ credentials/ shared/",
    "prepublishOnly": "npm run lint && npm run build && npm test",
    "test": "jest"
  }
}
```

**1.4 Update `.github/workflows/ci.yml`:**

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

**1.5 Run `npm run lint` once, capture output.** Expected violations:
- `no-restricted-imports`: `@langchain/openai` (2 files), `form-data` (1 file)
- `no-restricted-globals`: `globalThis` (1 file, 2 occurrences)
- Possibly: `credential-password-field`, `node-usable-as-tool`, description-formatting hits

Commit as: `feat: add ESLint with @n8n community-nodes plugin (Sprint 1)`

### Acceptance
- `npm run lint` runs without crashing
- CI workflow file updated (lives locally until Gap 3 PAT fix)
- All violations inventoried — they'll be fixed in Sprint 2

---

## Sprint 2 — Dependency Elimination

**Duration:** ~2-3 hours
**Goal:** Remove `@langchain/openai`, `form-data`, `globalThis.fetch`. End state: `"dependencies": {}`.

### 2.1 Rewrite `TokenSenseChatModel` to use `@n8n/ai-node-sdk`

**File:** `nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts`

**Primary pattern (simple `OpenAiModel` config):**

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
import { buildMetadata, loadModels } from '../../shared/utils';

// ... class body unchanged up to supplyData()

async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
  const credentials = await this.getCredentials('tokenSenseApi');
  const model = this.getNodeParameter('model', itemIndex) as string;
  const temperature = this.getNodeParameter('temperature', itemIndex) as number;
  const maxTokens = this.getNodeParameter('maxTokens', itemIndex, 0) as number;
  const streaming = this.getNodeParameter('streaming', itemIndex, true) as boolean;
  const metadata = buildMetadata(this, itemIndex);

  const modelConfig: OpenAiModel = {
    type: 'openai',
    model,
    baseUrl: `${credentials.endpoint as string}/v1`,
    apiKey: credentials.apiKey as string,
    temperature,
    streaming,
    ...(maxTokens > 0 ? { maxTokens } : {}),
    extraBody: { metadata },   // inject TokenSense metadata
  };

  return supplyModel(this, modelConfig);
}
```

**Verify:** The `extraBody` / `modelKwargs` field must actually propagate into the HTTP request body. Check `@n8n/ai-node-sdk` source for `supplyModel`/`getOpenAiModel`. If `extraBody` is dropped on the floor, use the **fallback pattern below**.

**Fallback pattern (advanced `BaseChatModel`):** Only if metadata injection doesn't work via the simple pattern.

```typescript
import { BaseChatModel, supplyModel } from '@n8n/ai-node-sdk';
import type { Message, GenerateResult, StreamChunk } from '@n8n/ai-node-sdk';

class TokenSenseChatModelProvider extends BaseChatModel {
  constructor(private config: {
    endpoint: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens?: number;
    streaming: boolean;
    metadata: Record<string, string>;
  }) {
    super();
  }

  async generate(messages: Message[], options?: { tools?: Tool[]; stop?: string[] }): Promise<GenerateResult> {
    const body = {
      model: this.config.model,
      messages: messages.map(toOpenAIMessage),
      temperature: this.config.temperature,
      ...(this.config.maxTokens ? { max_tokens: this.config.maxTokens } : {}),
      ...(options?.tools ? { tools: options.tools } : {}),
      ...(options?.stop ? { stop: options.stop } : {}),
      metadata: this.config.metadata,
    };
    const response = await fetch(`${this.config.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tokensense-key': this.config.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`TokenSense chat error ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return parseOpenAIResponse(data);
  }

  async *stream(messages: Message[], options?: { tools?: Tool[]; stop?: string[] }): AsyncGenerator<StreamChunk> {
    const body = { /* same as above, stream: true */ stream: true };
    const response = await fetch(`${this.config.endpoint}/v1/chat/completions`, { /* ... */ });
    for await (const event of parseSSEStream(response.body!)) {
      yield parseOpenAIStreamChunk(event);
    }
  }
}

// in supplyData:
const provider = new TokenSenseChatModelProvider({ /* config */ });
return supplyModel(this, provider);
```

Note: `fetch` (bare global) is permitted by `no-restricted-globals`; only `globalThis.fetch` is blocked. Confirm by reading the rule source.

**Acceptance:**
- No `@langchain/openai` import
- Node appears as `ai_languageModel` output in n8n
- Connected to AI Agent node → full chat works end-to-end against production (`https://api.tokensense.io/`)
- Metadata (`source=n8n`, `project=<workflow>`, `workflow_tag=<tag>`, `provider=<override>`) arrives in TokenSense logs
- Streaming still works (watch token-by-token render in an AI Agent memory test)
- Tool calling still works (test with a simple n8n workflow tool)

### 2.2 Drop `TokenSenseEmbeddings` from v0.1.0

**Files:** `package.json`, `nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts`, `test/TokenSenseEmbeddings.test.ts`

**Steps:**
1. In `package.json`, remove `"dist/nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.js"` from `n8n.nodes[]`
2. Keep `nodes/TokenSenseEmbeddings/` source in place (for v0.2.0)
3. Add a `.eslintignore` entry for `nodes/TokenSenseEmbeddings/**` *only* if lint errors on the unused file block the build — otherwise delete the disallowed imports from the file to keep lint clean
4. Remove/skip `test/TokenSenseEmbeddings.test.ts` — either delete or `describe.skip(...)` with a `// v0.2.0` comment
5. Update `README.md` to document the current embeddings story (HTTP node or TokenSense AI general node's embeddings op)

**Acceptance:**
- `package.json` `n8n.nodes[]` contains only `TokenSenseAi` and `TokenSenseChatModel`
- Lint passes on all active files
- Test suite passes without embeddings tests

### 2.3 Replace `form-data` in `TokenSenseAi`

**File:** `nodes/TokenSenseAi/TokenSenseAi.node.ts` (lines 9, 652-665)

**New code (uses n8n built-in multipart via `this.helpers.httpRequest`):**

```typescript
// Remove line 9: import FormData from 'form-data';

// In transcribeAudio handler:
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

**Verify:** If `contentType: 'multipart-form-data'` with nested file object isn't supported, try `this.helpers.httpRequestWithAuthentication` with the `request`-style `formData` option. Worst case, construct the multipart boundary manually using Node's `crypto.randomUUID()` (allowed import) and `Buffer.concat()`.

**Acceptance:**
- No `form-data` import anywhere
- Audio transcription works end-to-end against production with a real `.mp3` or `.wav`
- `Content-Type: multipart/form-data; boundary=...` auto-generated correctly

### 2.4 Update `package.json` to zero deps

**Final state:**

```json
{
  "dependencies": {},
  "peerDependencies": {
    "n8n-workflow": ">=1.0.0",
    "@n8n/ai-node-sdk": ">=0.4.1"
  },
  "devDependencies": {
    "@n8n/ai-node-sdk": "^0.4.1",
    "@n8n/eslint-plugin-community-nodes": "latest",
    "@types/jest": "^30.0.0",
    "@types/node": "^20.19.37",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-n8n-nodes-base": "^1.16.2",
    "jest": "^30.3.0",
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

### 2.5 Update Jest tests

**Files:** `test/TokenSenseChatModel.test.ts`, `test/TokenSenseAi.test.ts`, optionally `test/TokenSenseEmbeddings.test.ts` (skip/delete)

**Key mock updates:**
- `TokenSenseChatModel`: mock `supplyModel` from `@n8n/ai-node-sdk` instead of `ChatOpenAI` constructor
- `TokenSenseAi`: update multipart assertions — check that `this.helpers.httpRequest` is called with `contentType: 'multipart-form-data'` and the correct body structure
- Update metadata injection assertions to match `extraBody.metadata` (or the fallback provider's request body)

**Acceptance:**
- `npm test` passes (44 tests minus embeddings tests — aim for ~35-40 passing)

### Sprint 2 Commit Structure

One PR, multiple commits:
- `feat: migrate TokenSenseChatModel to @n8n/ai-node-sdk`
- `feat: replace form-data with n8n built-in multipart in TokenSenseAi`
- `chore: drop TokenSenseEmbeddings from v0.1.0 (deferred to v0.2.0)`
- `chore: remove @langchain/openai, form-data, langsmith override`
- `test: update mocks for scanner-clean node implementations`
- `docs: update README with v0.1.0 embeddings story`

Open PR `Sprint 2: scanner-clean refactor` against `main`.

---

## Sprint 3 — Last Pass + Publish Prep

**Duration:** ~30-45 min
**Goal:** All green locally. Ready to tag.

### 3.1 Run the full green path

```bash
npm run lint    # must exit 0
npm run build   # clean TypeScript compile
npm test        # all remaining tests pass
npm pack --dry-run 2>&1 | head -30
```

Verify `npm pack --dry-run` output:
- Only includes `dist/`, `icons/`, `package.json`, `LICENSE`, `README.md`
- Does NOT include `node_modules/`, `.github/`, `docs/`, `test/`, `nodes/` source
- Tarball size is reasonable (expect <100KB)

### 3.2 Package name availability

```bash
npm view n8n-nodes-tokensense
# Expected: 404 / E404 — name is free
```

If the name is taken, stop and discuss with Carlo. Alternate: `@tokensense/n8n-nodes` (scoped).

### 3.3 README final polish

Confirm `README.md` covers:
- What TokenSense is (one-liner)
- Install: "Settings → Community Nodes → install `n8n-nodes-tokensense`"
- Credential setup: endpoint (`https://api.tokensense.io`) + API key from app.tokensense.io/keys
- Quick example: AI Agent workflow with TokenSense Chat Model sub-node
- Quick example: general TokenSense AI node (chat completion)
- Embeddings story for v0.1.0 (HTTP Request or general node embeddings op)
- Link to docs (github.com/TheYote12/n8n-nodes-tokensense)
- License (MIT)

### 3.4 Dry-run publish

```bash
npm login
npm publish --provenance --access public --dry-run
```

Review the dry-run output. Confirm:
- Package name: `n8n-nodes-tokensense`
- Version: `0.1.0`
- Provenance enabled
- File list matches expectations

### 3.5 Integration smoke tests

Before tagging, run 3 end-to-end scenarios locally against production:
1. **Chat Model sub-node + AI Agent:** Install the local build in a test n8n instance, wire to AI Agent, send a tool-calling workflow
2. **General AI node chat completion:** Call `chatCompletion` operation with a Claude Opus model
3. **Audio transcription:** Call `transcribeAudio` with a small `.mp3`

All three should succeed and produce logs in TokenSense dashboard with correct `source=n8n` metadata.

---

## Carlo's Manual Steps (Gap 3)

These must be done before the tag push can succeed. Claude Code cannot do these.

### 3A. GitHub PAT — add `workflow` scope

1. github.com/settings/tokens
2. Edit the existing PAT (or create a new fine-grained one for `TheYote12/n8n-nodes-tokensense`)
3. Check the `workflow` checkbox
4. Save
5. Verify by pushing a small change to `.github/workflows/ci.yml` from a test branch

### 3B. npm account + token

1. Log in to npmjs.com (or create account for `carlob-personal` or similar)
2. Enable 2FA (TOTP required for publishing)
3. Access Tokens → Generate New Token → **Granular Access Token**
4. Name: `github-actions-n8n-nodes-tokensense`
5. Expiration: 365 days (add calendar reminder)
6. Packages: "All packages" (since `n8n-nodes-tokensense` doesn't exist on npm yet — can scope down after first publish)
7. Copy the token immediately (shown only once)

### 3C. Add `NPM_TOKEN` to GitHub repo secrets

1. github.com/TheYote12/n8n-nodes-tokensense → Settings → Secrets and variables → Actions
2. New repository secret
3. Name: `NPM_TOKEN`
4. Value: paste the token from 3B
5. Save

### 3D. (Optional, recommended later) — OIDC Trusted Publishing

The `publish.yml` workflow already has `permissions: id-token: write`. We can migrate off `NPM_TOKEN` once the package exists on npm:
- npmjs.com → package settings → Trusted Publishers
- Add GitHub Actions trusted publisher for `TheYote12/n8n-nodes-tokensense`, workflow `publish.yml`
- Remove `NPM_TOKEN` from GitHub secrets
- This is a post-v0.1.0 improvement, not a blocker.

---

## Last-Pass Checklist (Pre-Tag)

Before running `git tag v0.1.0`, confirm every one of these. Run in order.

- [ ] `git status` is clean on the working branch
- [ ] `git log` shows Sprint 1 + Sprint 2 commits merged into `main`
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0 with no errors or warnings
- [ ] `npm test` exits 0
- [ ] `npm pack --dry-run` tarball contents correct (see 3.1)
- [ ] `package.json`:
  - [ ] `"version": "0.1.0"`
  - [ ] `"name": "n8n-nodes-tokensense"`
  - [ ] `"dependencies": {}`
  - [ ] `"n8n.nodes[]"` contains only `TokenSenseAi` and `TokenSenseChatModel`
  - [ ] `"n8n.credentials[]"` contains `TokenSenseApi`
- [ ] `npm view n8n-nodes-tokensense` returns 404 (name free)
- [ ] `README.md` has install, credential, quick-start, embeddings note, license
- [ ] `LICENSE` file present (MIT)
- [ ] Icon renders correctly in `dist/icons/tokensense.svg`
- [ ] `NPM_TOKEN` present in GitHub repo secrets
- [ ] `.github/workflows/publish.yml` pushed to GitHub (PAT `workflow` scope active)
- [ ] `.github/workflows/ci.yml` last run is green
- [ ] CHANGELOG or release notes draft ready (for GitHub release)

---

## Publish Procedure

Once the last-pass checklist is fully green:

```bash
# 1. Merge final PR to main (if not already)
gh pr merge <sprint-2-pr-number>

# 2. Pull latest main
git checkout main && git pull

# 3. Tag
git tag v0.1.0
git push origin v0.1.0

# 4. Watch the publish workflow
gh run watch
```

The `.github/workflows/publish.yml` action will:
1. `npm ci`
2. `npm run build`
3. `npm test`
4. `npm publish --provenance --access public`

Success = package appears at `https://www.npmjs.com/package/n8n-nodes-tokensense` with provenance badge.

**If publish fails:**
- Authentication: check `NPM_TOKEN` secret and `registry-url`
- Provenance: confirm `id-token: write` permission in workflow
- Version collision: shouldn't happen on first publish; if somehow it does, bump to `0.1.1` and retag
- Test failure: fix, re-commit to `main`, delete the failed tag (`git tag -d v0.1.0 && git push --delete origin v0.1.0`), retag

---

## Post-Publish

### Immediate (same session)

1. Run `npx @n8n/scan-community-package n8n-nodes-tokensense` — scanner result is informational (AI nodes aren't verification-eligible per n8n docs). Archive the output.
2. Install from the live n8n community nodes UI on a test instance → verify install succeeds
3. Create AI Agent workflow using TokenSense Chat Model → verify ICP scenario

### Within 48 hours

4. Add "Install Community Node" section to TokenSense Connect page (Dashboard/app/(dashboard)/connect) — one-click instructions: Settings → Community Nodes → install `n8n-nodes-tokensense`
5. Update `/Users/carlo/Documents/SecondBrain/01 Projects/TokenSense/n8n Community Node.md` — change `status: built-not-published` to `status: published-v0.1.0`, remove blocker list, add npm + provenance link
6. Update `docs/STATUS.md` on the main `tokensense` repo — note v0.1.0 ships
7. Memory update: mark `project_n8n_integration_gap.md` resolved

### Within 1 week

8. Post to n8n community forum — AI Gateway thread + general showcase thread
9. Tweet/LinkedIn announcement with positioning: *"only n8n AI Gateway with a Chat Model sub-node"*
10. Add blog post to tokensense.io/blog about the integration (SEO)
11. Update ICP-aligned content in TokenSense Connect Hub with per-provider native-setup instructions
12. Plan v0.2.0 sprint for embeddings

---

## Open Risks

### R1 — Metadata injection via `supplyModel`
**Probability:** Medium
**Impact:** +2 hours if it hits
**Mitigation:** Inspect `@n8n/ai-node-sdk` source before committing to the simple pattern. If `extraBody` doesn't propagate, switch to the advanced `BaseChatModel` pattern (fully specified above).
**Detection:** End-to-end chat call → check TokenSense logs for `metadata.source=n8n`.

### R2 — Multipart upload via `this.helpers.httpRequest`
**Probability:** Low-Medium
**Impact:** +1 hour
**Mitigation:** If nested file-object syntax isn't supported, fall back to `this.helpers.httpRequestWithAuthentication` with `formData` option (wraps the `request` library), or hand-build the multipart boundary.
**Detection:** Audio transcription with a real `.mp3` → check for correct `Content-Type: multipart/form-data; boundary=...` and successful 200 response.

### R3 — Scanner rejects the published package
**Probability:** Low (local ESLint with same rules should catch 90%+)
**Impact:** +1-2 hours to fix + republish as `0.1.1`
**Mitigation:** Run `npx @n8n/scan-community-package ./n8n-nodes-tokensense-0.1.0.tgz` against a local `npm pack` output before publishing. If the scanner doesn't accept local tarballs, publish as `0.1.0-beta.1` first, scan, fix, then publish `0.1.0`.

### R4 — `fetch` bare global still triggers `no-restricted-globals`
**Probability:** Low
**Impact:** +30 min
**Mitigation:** Use `this.helpers.httpRequest` in the `BaseChatModel` fallback instead of `fetch` directly. The n8n HTTP helper is always allowed.

### R5 — SDK `@n8n/ai-node-sdk` API break between versions
**Probability:** Low short-term, Medium long-term
**Impact:** Forces a minor rewrite + republish
**Mitigation:** Pin `@n8n/ai-node-sdk` in `peerDependencies` to `>=0.4.1 <0.5.0` if the beta API diverges meaningfully. Subscribe to n8n release notes.

### R6 — Carlo's PAT/npm setup hits 2FA friction
**Probability:** Low
**Impact:** Minor delay (15-30 min)
**Mitigation:** Use an authenticator app (Authy, 1Password), save recovery codes immediately.

---

## Success Criteria

- [ ] `n8n-nodes-tokensense@0.1.0` published to npm with provenance badge
- [ ] Package installable via n8n community nodes UI in production
- [ ] `TokenSense Chat Model` sub-node connects to AI Agent and executes tool-calling workflows end-to-end
- [ ] `TokenSense AI` general node passes all 8 operations in integration tests
- [ ] Metadata (`source=n8n`, `project`, `workflow_tag`, `provider`) arrives in TokenSense logs for every call
- [ ] Zero external runtime dependencies
- [ ] `npm pack --dry-run` tarball is clean
- [ ] CI green
- [ ] SecondBrain vault and `docs/STATUS.md` updated

**North-star post-publish (within 30 days):**
- First 5 external users install from the community nodes UI
- Zero Critical/High security issues reported
- Blog post + forum post drive >500 TokenSense.io visits from n8n ecosystem
