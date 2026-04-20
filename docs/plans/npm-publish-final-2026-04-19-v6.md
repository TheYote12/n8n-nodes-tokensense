# npm Publish — Final Plan (v6)

> **Status:** Drafted 2026-04-19. Final pre-dispatch version — v5 approved pending these patches.
> **Supersedes:** `docs/plans/npm-publish-final-2026-04-19-v5.md`
> **Target version:** `0.1.0` (preceded by `0.1.0-beta.1` if scanner requires a published tarball)
> **Publish path:** NPM_TOKEN (Bypass-2FA granular token); Trusted Publishers migration deferred to v0.2.0
> **Embeddings strategy:** Option A — relocate to `future/`, defer to v0.2.0

---

## v6 changes from v5

v5 was approved with five patches + two polish items:

1. **Smoke test install path → `/home/node/.n8n/nodes`.** n8n's community-node install docs specify `~/.n8n/nodes` (the default path the GUI installer uses), not `N8N_CUSTOM_EXTENSIONS`. Using the documented path removes a potential false-green from Sprint 3.4.
2. **Tightened endpoint regex.** Copy says bare-origin only; regex now matches copy. `^https?://[^/?#]+/?$` rejects any path segment (including `/v1`, `/foo`, `/foo/v1`). Credential test `.replace()` only strips trailing slash. Runtime `normalizeBaseUrl()` stays forgiving.
3. **Sprint 0 gate count fixed.** Five gates (0.1, 0.2, 0.3, 0.5, 0.6) + 0.4 is a recording step, not a gate. Success criteria rewritten so coding agents can't invent a nonexistent sixth gate.
4. **n8n version note.** v5's `N8N_VERSION <some 1.x>` was wrong — n8n is on 2.x on npm. Changed to `<current n8n version>` to avoid implying a specific major.
5. **`engines.node` aligned to n8n's actual requirement.** n8n's own docs require Node 20.19–24.x for install and 22.22.0 for node development. v5's `">=18.0.0"` was too permissive. v6 uses `">=20.19 <25"`.

Polish:
- `@types/node` bumped to `^22.0.0` to match CI Node 22.
- Beta-first wording clarified — "same source tree, version-only commit" instead of "same commit" (the version bump is itself a commit).

---

## Why v5 existed

v4 fixed eight correctness issues but still carried seven regressions that surface once you check the actual repo contents and n8n's community-node metadata requirements. v5 applied Carlo's final-before-implementation corrections:

1. **Package metadata preserved.** v4's Sprint 2.7 rewrite accidentally dropped `keywords` (which must include `n8n-community-node-package`), plus `repository`, `homepage`, `bugs`, `engines`. The actual repo already has these — v5 restores them in the plan block so the refactor doesn't remove them.
2. **Credential test expression uses runtime-safe JS.** TypeScript `as string` is a compile-time cast that n8n's expression evaluator does not understand. v5 uses `String($credentials.endpoint).trim()` and only strips trailing slashes (not `/v1`) — bare-origin enforced via copy + regex validator.
3. **Node 22 in CI + runtime gate.** Sprint 0 adds a runtime check: confirm `n8n@latest` declares `engines.node` compatible with Node 22 before committing CI to it. Default target Node 22; fall back to 20 only if the gate proves 22 unsupported.
4. **Sprint 1 n8n-node-cli layout gate.** Before permanently replacing scripts with `n8n-node build/lint`, run one dry invocation on the existing layout. If our layout is incompatible (scaffolded layout differs from ours), either migrate layout or keep raw `tsc` + `eslint` for v0.1.0.
5. **`main` field corrected.** There is no `src/index.ts` or root `index.ts` in the repo. v4's `"main": "dist/index.js"` would ship broken. v5 removes `main` entirely (n8n uses `n8n.nodes[]`, not `main`, to locate nodes) and Sprint 3.2 confirms the packed tarball omits any dangling `main` reference.
6. **Transcribe audio response shape asserted.** Current handler (line 675) reads `response.body` when `returnFullResponse: true`. The rewrite and its Jest test must preserve that contract — otherwise migration silently breaks the node.
7. **Scanner runs pre-publish where possible.** `npx @n8n/scan-community-package n8n-nodes-tokensense` takes a published package name, not a local tarball. If local scanning isn't supported by the scanner version we use, publish `0.1.0-beta.1` first → scan → if clean, publish `0.1.0` from the same source tree (version-only commit).

All corrections from v2/v3/v4 carry forward unchanged unless explicitly modified here.

### Confirmed data (reverified 2026-04-19)

- `@n8n/ai-node-sdk` latest on npm: **0.8.0** (2026-04-13). n8n master `packages/@n8n/ai-node-sdk/package.json` declares `"version": "0.8.0"`. `packages/cli/package.json` declares `@n8n/ai-node-sdk: workspace:*`. → published n8n ships 0.8.x.
- Current `package.json` already has `keywords` with `n8n-community-node-package`, `repository`, `homepage`, `bugs`, `engines.node: ">=18.0.0"`, and `n8n.nodes[] + n8n.credentials[]`.
- Current `main` points to `dist/nodes/TokenSenseAi/TokenSenseAi.node.js` (non-standard; n8n doesn't use it). No `src/index.ts` exists.
- `transcribeAudio` currently reads `response.body` with `returnFullResponse: true`. `nativeAnthropic` and other ops with `returnFullResponse` follow the same `.body` pattern.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Sprint 0 — Runtime Feasibility Gate (MANDATORY)](#sprint-0--runtime-feasibility-gate-mandatory)
3. [Sprint 1 — Tooling Foundation (with compat gate)](#sprint-1--tooling-foundation-with-compat-gate)
4. [Sprint 2 — Scanner-Clean Refactor](#sprint-2--scanner-clean-refactor)
5. [Sprint 3 — Packed Tarball + Scanner + Publish Prep](#sprint-3--packed-tarball--scanner--publish-prep)
6. [Carlo's Manual Steps](#carlos-manual-steps)
7. [Publish Procedure (Beta-First if Required)](#publish-procedure-beta-first-if-required)
8. [Post-Publish](#post-publish)
9. [Open Risks](#open-risks)
10. [Success Criteria](#success-criteria)

---

## Executive Summary

Ship `n8n-nodes-tokensense@0.1.0` to npm, scanner-clean, with:
- `TokenSense Chat Model` sub-node (AI Agent `ai_languageModel` output, via `supplyModel()` + `OpenAiModel` with `additionalParams.metadata`)
- `TokenSense AI` general node (8 operations, authenticated via `httpRequestWithAuthentication` + credential `authenticate` block)
- `TokenSenseApi` credential (bare-origin endpoint enforced by regex + copy; `authenticate` injects `x-tokensense-key`; declarative `test` via `GET /v1/models`)

Deferred to v0.2.0: `TokenSense Embeddings` sub-node; OIDC Trusted Publishers; custom `BaseChatModel` subclass (only if a future pattern can't ride `additionalParams`).

**Gates that block tagging v0.1.0:**
- Sprint 0 (3 gates) all green
- Sprint 1 n8n-node-cli compat decision made and documented
- Sprint 2 PR merged, lint + test + build green
- Sprint 3 packed-tarball smoke test (4 sub-gates) all green
- Sprint 3 scanner clean — either against local tarball or against a `0.1.0-beta.1` pre-publish

---

## Sprint 0 — Runtime Feasibility Gate (MANDATORY)

**Duration:** ~45-60 min
**Goal:** Empirically confirm the four load-bearing assumptions before Sprint 1. All gates are hard blockers.

### 0.1 (GATE) Bearer auth passes against production proxy

```bash
export TS_TEST_KEY="<Carlo's test-workspace TokenSense key>"
curl -sS -X POST https://api.tokensense.io/v1/chat/completions \
  -H "Authorization: Bearer $TS_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
  -w "\nHTTP %{http_code}\n"
```

**Pass:** HTTP 200 + valid completion payload.
**Fail:** Stop. Proxy auth contract changed.

### 0.2 (GATE) Body-level `metadata` reaches TokenSense logs

```bash
export MARK="v6-audit-$(date +%s)"
curl -sS -X POST https://api.tokensense.io/v1/chat/completions \
  -H "Authorization: Bearer $TS_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\":\"gpt-4o-mini\",
    \"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],
    \"max_tokens\":5,
    \"metadata\":{\"source\":\"v6-gate\",\"workflow_tag\":\"$MARK\"}
  }"
```

Verify in TokenSense Dashboard → Logs (`workflow_tag = $MARK`) → row exists with `source = v6-gate`.

**Pass:** log row visible with both fields.
**Fail:** Stop.

### 0.3 (GATE) Clean n8n runtime resolves `@n8n/ai-node-sdk@0.8.x`

Preferred — Docker:

```bash
docker run --rm n8nio/n8n:latest /bin/sh -c '
  node -e "
    const sdk = require(\"@n8n/ai-node-sdk\");
    const pkg = require(\"@n8n/ai-node-sdk/package.json\");
    const n8nPkg = require(\"n8n/package.json\");
    console.log(\"N8N_VERSION\", n8nPkg.version);
    console.log(\"N8N_ENGINES_NODE\", JSON.stringify(n8nPkg.engines));
    console.log(\"SDK_VERSION\", pkg.version);
    console.log(\"HAS_supplyModel\", typeof sdk.supplyModel);
  "
'
```

Expected:
```
N8N_VERSION <current n8n version>                (record exact version — do NOT assume 1.x; n8n is on 2.x)
N8N_ENGINES_NODE {"node":">=20.19 <=24.x"}       (or similar — record exact range)
SDK_VERSION 0.8.0                                (or 0.8.x)
HAS_supplyModel function
```

Fallback (no Docker) — fresh npm install on the Mac:

```bash
mkdir -p /tmp/n8n-gate && cd /tmp/n8n-gate
npm init -y >/dev/null
npm install n8n@latest --no-save --prefix . >/tmp/n8n-install.log 2>&1
node -e '
  const n = require("./node_modules/n8n/package.json");
  const s = require("./node_modules/@n8n/ai-node-sdk/package.json");
  const sdk = require("./node_modules/@n8n/ai-node-sdk");
  console.log("N8N_VERSION", n.version);
  console.log("N8N_ENGINES_NODE", JSON.stringify(n.engines));
  console.log("SDK_VERSION", s.version);
  console.log("HAS_supplyModel", typeof sdk.supplyModel);
'
```

**Pass:** SDK ≥ 0.8.0 < 0.9.0, `supplyModel` is a function.
**Fail:** Stop.

### 0.4 Record exact peer-range floor/ceiling from 0.3

Use the output of 0.3 to set Sprint 2.7 values:

- `peerDependencies.@n8n/ai-node-sdk`: `">=0.8.0 <0.9.0"` (verify minor still `8`)
- `devDependencies.@n8n/ai-node-sdk`: exact patch from 0.3 (default `"0.8.0"`)

### 0.5 (GATE) Confirm `additionalParams` → HTTP body mapping in 0.8.x

```bash
cd /tmp/n8n-gate
node -e '
  const path = require("path");
  const src = require("fs").readFileSync(
    path.join("node_modules", "@n8n", "ai-utilities", "dist", "esm", "suppliers", "supplyModel.js"),
    "utf8"
  );
  console.log(src.includes("additionalParams") ? "OK additionalParams mapped" : "BROKEN — field renamed");
'
```

**Pass:** `OK additionalParams mapped`.
**Fail:** Stop. Grep source for the new field name; update Sprint 2.4.

### 0.6 (GATE) Node-version compatibility for CI

Read `engines.node` from 0.3's `N8N_ENGINES_NODE` line. Map to CI matrix:

| `engines.node` declared by `n8n@latest` | CI Node version (v6 default) |
|-----------------------------------------|-------------------------------|
| Includes `22` (e.g. `">=20 <=22"`) | **Node 22** (upgrade from v4's 20) |
| Caps at `20` (e.g. `">=18 <22"`) | Node 20 (fall back) |
| Caps at `18` | Node 18 (unlikely but handle) |

Record decision in `docs/audits/sprint-0-feasibility-2026-04-19.md`.

Sprint 1.6 `ci.yml` reads `node-version: '22'` by default; if 0.6 says otherwise, drop to 20.

### Sprint 0 Commit

None. Record all findings in `docs/audits/sprint-0-feasibility-2026-04-19.md` with timestamps, exact SDK version, n8n version + engines range, log row id from 0.2, and SDK grep output from 0.5.

---

## Sprint 1 — Tooling Foundation (with compat gate)

**Duration:** ~90-120 min
**Goal:** Adopt scaffold tooling if the existing layout works with `@n8n/node-cli`; otherwise keep raw `tsc` + `eslint` plus the exact community-node lint plugin. CI runs lint + build + test.

### 1.1 Install dev dependencies (exact pins)

```bash
npm install --save-dev \
  @n8n/node-cli@^0.23.0 \
  @n8n/eslint-plugin-community-nodes@0.10.0 \
  eslint-plugin-n8n-nodes-base@^1.16.2 \
  eslint@^9.0.0 \
  @typescript-eslint/parser@^8.0.0
npm install --save-dev jest@^29.7.0 @types/jest@^29.5.0
```

Remove `@types/jest@^30.0.0` and `jest@^30.3.0` from `devDependencies` in the same commit.

### 1.2 (GATE) n8n-node-cli layout compatibility check

**Correction #4 applied.** Before adopting `n8n-node build/lint/dev/release` as permanent scripts, run one dry invocation against the existing layout:

```bash
# Dry-run build: does @n8n/node-cli find our nodes?
npx n8n-node build --help   # confirm CLI is installed and runs
npx n8n-node build          # build against current layout

# Dry-run lint:
npx n8n-node lint
```

**Decision matrix:**

| Outcome of dry-runs | Path taken |
|---------------------|-----------|
| Both succeed (build writes `dist/` with all 3 expected files; lint produces violations, not crashes) | **Path A — adopt scaffold.** Proceed to 1.3 with `n8n-node` scripts. |
| Build crashes (e.g. demands `src/nodes/**` or missing scaffold files) | **Path B — skip scaffold for v0.1.0.** Keep raw `tsc` + `eslint` in scripts. Remove `@n8n/node-cli` from devDependencies. v0.1.0 ships without it; v0.2.0 can migrate layout. |
| Lint crashes only | **Path A' — use scaffold for build, raw eslint for lint.** Keeps the lint plugin rules intact without requiring scaffold to own lint. |

Record decision in `docs/audits/sprint-1-compat-2026-04-19.md`. Path A is preferred (same tool n8n-io uses). Path B is safe if layout migration is too invasive for v0.1.0.

### 1.3 Update scripts (depends on 1.2 outcome)

**Path A (scaffold works):**

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

**Path B (scaffold skipped):**

```json
{
  "scripts": {
    "build": "tsc",
    "postbuild": "cp -r icons dist/icons",
    "lint": "eslint \"nodes/**/*.ts\" \"credentials/**/*.ts\" \"shared/**/*.ts\"",
    "lint:fix": "eslint --fix \"nodes/**/*.ts\" \"credentials/**/*.ts\" \"shared/**/*.ts\"",
    "test": "jest",
    "prepublishOnly": "npm run lint && npm run build && npm test"
  }
}
```

Either path, the `postbuild` icon-copy stays if `build` doesn't copy icons to `dist/`.

### 1.4 ESLint 9 flat config (`eslint.config.mjs`)

Same as v4 Sprint 1.3 — unchanged through v5 and v6:

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
    rules: { ...n8nNodesBase.configs.credentials.rules },
  },
  { ignores: ['dist/**', 'node_modules/**', 'test/**', 'docs/**', 'future/**'] },
];
```

### 1.5 Tighten `tsconfig.json`

```json
{
  "compilerOptions": { /* unchanged from current */ },
  "include": ["nodes/**/*.ts", "credentials/**/*.ts", "shared/**/*.ts"],
  "exclude": ["node_modules", "dist", "test", "future"]
}
```

### 1.6 Explicit `jest.config.js`

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/future/'],
};
```

### 1.7 `.github/workflows/ci.yml` — Node version per 0.6

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
          node-version: '22'           # default — Sprint 0.6 may drop this to 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

### 1.8 Dry-run lint (inventory violations)

| File | Rule | Fix in |
|------|------|--------|
| `nodes/TokenSenseChatModel/TokenSenseChatModel.node.ts:9` | `no-restricted-imports` (`@langchain/openai`) | Sprint 2.4 |
| `nodes/TokenSenseAi/TokenSenseAi.node.ts:9` | `no-restricted-imports` (`form-data`) | Sprint 2.6 |
| `nodes/TokenSenseAi/TokenSenseAi.node.ts` (8 ops) | `no-http-request-with-manual-auth` | Sprint 2.5 |
| `shared/utils.ts` `loadModels` | `no-http-request-with-manual-auth` | Sprint 2.5 |

After embeddings relocation (Sprint 2.1), zero `restricted-globals` violations; only the restricted-imports/manual-auth violations above remain.

### Sprint 1 Commits
- `chore: compat check for @n8n/node-cli + scaffold decision`
- `chore: add flat ESLint 9 config with @n8n/community-nodes@0.10.0`
- `chore: add explicit jest.config.js excluding future/`
- `chore: downgrade Jest to 29.7 for ts-jest compatibility`
- `chore: tighten tsconfig exclude for future/ and test/`
- `ci: run lint + build + test on Node <version from 0.6>`

Open PR `Sprint 1: tooling foundation`.

### Acceptance
- 1.2 compat decision recorded
- `npm run lint` runs without crashing
- `npm run build` produces `dist/` (no `future/` compilation attempts)
- `npm test` does not discover files under `future/`
- CI green

---

## Sprint 2 — Scanner-Clean Refactor

**Duration:** ~3-4 hours
**Goal:** `"dependencies": {}`. All lint violations cleared. Every HTTP call authenticated via the credential. Metadata still reaches TokenSense logs. No regression in response-shape contracts.

### 2.1 Relocate embeddings to `future/`

```bash
mkdir -p future
git mv nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts future/TokenSenseEmbeddings.node.ts
git rm -rf nodes/TokenSenseEmbeddings/
git mv test/TokenSenseEmbeddings.test.ts future/TokenSenseEmbeddings.test.ts.bak
```

Belt-and-braces: `.bak` extension breaks default Jest discovery even if config changes.

Remove embeddings from `package.json` `n8n.nodes[]` (keep all other fields untouched).

### 2.2 Add `authenticate` block + fix endpoint validation

**Correction #2 applied.** `as string` is TypeScript-only; n8n expressions run as raw JS. Use `String(...)` + only strip trailing slash in the credential test. Enforce bare-origin via property description + regex validator. Keep `normalizeBaseUrl()` for runtime calls.

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
        'Bare origin only — do NOT include /v1. Correct: https://api.tokensense.io. Incorrect: https://api.tokensense.io/v1',
      required: true,
      typeOptions: {
        // Bare origin only — no path segments. Optional trailing slash allowed (stripped by
        // the credential test and by normalizeBaseUrl at runtime).
        regexp: {
          regex: '^https?://[^/?#]+/?$',
          errorMessage:
            'Enter the bare origin only, for example https://api.tokensense.io. Do not include /v1 or any path.',
        },
      },
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
      // Runtime-safe: String() coerces, trim() + replace() strip trailing slashes.
      // No /v1 stripping here — the property-level regex blocks /v1 at end, so
      // the constructed URL is always origin + '/v1/models'.
      baseURL: '={{ String($credentials.endpoint).trim().replace(/\\/+$/, "") }}',
      url: '/v1/models',
    },
  };
}

export default TokenSenseApi;
```

Why this regex + simple test expression works:
- The regex matches the copy: bare origin only, optional trailing slash — no path segments permitted (rejects `/v1`, `/foo`, `/foo/v1`, etc.).
- A single `.replace(/\/+$/, "")` is safe in n8n's expression engine and handles the trailing-slash case.
- UI-side regex gives users immediate feedback before they save the credential.
- `normalizeBaseUrl()` still protects runtime calls as a defense-in-depth net.
- If the expression engine rejects even the single `.replace()` (R8), fall back to `baseURL: '={{$credentials.endpoint}}'` with a stricter regex that also forbids the trailing slash (`^https?://[^/?#]+$`) — the regex alone enforces the canonical form.

### 2.3 `normalizeBaseUrl()` helper

```typescript
// shared/utils.ts
export function normalizeBaseUrl(input: string): string {
  const trimmed = String(input).trim().replace(/\/+$/, '');
  return trimmed.replace(/\/v1$/, '');
}
```

Test cases in `test/utils.test.ts`:
- `'https://api.tokensense.io'` → `'https://api.tokensense.io'`
- `'https://api.tokensense.io/'` → `'https://api.tokensense.io'`
- `'https://api.tokensense.io/v1'` → `'https://api.tokensense.io'`
- `'https://api.tokensense.io/v1/'` → `'https://api.tokensense.io'`
- `'https://api.tokensense.io//v1//'` → `'https://api.tokensense.io'`

### 2.4 Rewrite `TokenSenseChatModel` with `supplyModel` + `additionalParams`

Same as v4 Sprint 2.4 — unchanged through v5 and v6 (SDK field name, structure, stop-and-replan clause all carry forward).

### 2.5 Migrate TokenSenseAi to `httpRequestWithAuthentication`

All 8 ops + `shared/utils.ts:loadModels`. Same pattern as v4 Sprint 2.5.

### 2.6 Replace `form-data` in `transcribeAudio` — preserve response-body contract

**Correction #6 applied.** The current handler reads `response.body` (line 675). The rewrite must preserve that contract AND its Jest test must assert it.

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
      returnFullResponse: true,   // NOTE: keeps .body contract below
    },
  );

  // CONTRACT: with returnFullResponse: true, handler reads response.body.
  // If n8n's httpRequestWithAuthentication flips this contract, Sprint 3.4
  // smoke test for transcribeAudio will surface the failure.
  const responseBody = response.body as
    | { text?: string; tokensense?: { request_id?: string; cost_usd?: number; model?: string; provider?: string; latency_ms?: number } }
    | string;

  const text = typeof responseBody === 'string' ? responseBody : (responseBody.text ?? '');
  const meta = typeof responseBody === 'string' ? undefined : responseBody.tokensense;
  returnData.push({
    json: {
      text,
      requestId: meta?.request_id ?? '',
      cost: String(meta?.cost_usd ?? ''),
      provider: meta?.provider ?? '',
      latencyMs: meta?.latency_ms ?? null,
    },
  });
}
```

**Jest contract assertion** in `test/TokenSenseAi.test.ts`:

```typescript
it('transcribeAudio reads response.body (not the raw response) when returnFullResponse is true', async () => {
  const mockHelper = jest.fn().mockResolvedValue({
    body: {
      text: 'hello world',
      tokensense: { request_id: 'req_123', cost_usd: 0.0012, provider: 'openai', latency_ms: 412 },
    },
    statusCode: 200,
    headers: {},
  });
  // ... wire mock as this.helpers.httpRequestWithAuthentication ...
  const result = await runOperation('transcribeAudio', {
    binary: { data: { mimeType: 'audio/wav', fileName: 'a.wav' } },
  });
  expect(result[0].json.text).toBe('hello world');
  expect(result[0].json.requestId).toBe('req_123');
  // Negative case: if the handler had read the raw response (not .body) the text would be undefined.
  expect(result[0].json.text).not.toBeUndefined();
});
```

Apply the same contract assertion to all ops with `returnFullResponse: true`:
- `nativeAnthropic` (currently line 714 → `.body`)
- any other handler in TokenSenseAi with `returnFullResponse: true` — audit in Sprint 2.5 and add a matching test.

Fallback ladder (unchanged from v4) if multipart serialisation fails:
1. `this.helpers.request.call(this, { formData: ... })`
2. Hand-build multipart with `crypto.randomUUID()` + `Buffer.concat()`

### 2.7 `package.json` — zero runtime deps + ALL metadata preserved

**Correction #1 applied.** Restore every field the current `package.json` already has (v4 accidentally dropped several). Remove only: `main` (correction #5), `@langchain/openai`, `form-data`, and the `langsmith` override.

```json
{
  "name": "n8n-nodes-tokensense",
  "version": "0.1.0",
  "description": "n8n community node for TokenSense — unified LLM proxy with cost tracking, multi-provider routing, and project management",
  "keywords": [
    "n8n-community-node-package",
    "n8n",
    "ai",
    "llm",
    "openai",
    "anthropic",
    "google",
    "tokensense",
    "ai-gateway",
    "proxy"
  ],
  "license": "MIT",
  "homepage": "https://github.com/TheYote12/n8n-nodes-tokensense",
  "repository": {
    "type": "git",
    "url": "https://github.com/TheYote12/n8n-nodes-tokensense.git"
  },
  "bugs": {
    "url": "https://github.com/TheYote12/n8n-nodes-tokensense/issues"
  },
  "scripts": { /* per Sprint 1.3 — Path A or Path B */ },
  "files": [
    "dist",
    "icons",
    "README.md",
    "LICENSE"
  ],
  "n8n": {
    "n8nNodesApiVersion": 1,
    "nodes": [
      "dist/nodes/TokenSenseAi/TokenSenseAi.node.js",
      "dist/nodes/TokenSenseChatModel/TokenSenseChatModel.node.js"
    ],
    "credentials": [
      "dist/credentials/TokenSenseApi.credentials.js"
    ]
  },
  "engines": {
    "node": ">=20.19 <25"
  },
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
    "@types/node": "^22.0.0",
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

Field-by-field audit vs. current `package.json`:

| Field | Current | v6 | Why |
|-------|---------|----|----|
| `name` | `n8n-nodes-tokensense` | same | required `n8n-nodes-` prefix ✓ |
| `keywords` | includes `n8n-community-node-package` | same | required for n8n community-node registry discovery |
| `repository` / `homepage` / `bugs` | present | same | required fields per npm + community-node metadata |
| `engines.node` | `">=18.0.0"` | `">=20.19 <25"` | aligned with n8n's own install requirement (20.19–24.x); prevents users on Node 18 from installing into an n8n that won't run; correction v5→v6 #5 |
| `main` | `"dist/nodes/TokenSenseAi/TokenSenseAi.node.js"` | **REMOVED** | n8n doesn't use `main` (uses `n8n.nodes[]`); current value is misleading; no `src/index.ts` exists; correction #5 |
| `files` | `["dist","icons","package.json","LICENSE","README.md"]` | `["dist","icons","README.md","LICENSE"]` | drop `package.json` (npm always includes it) |
| `dependencies` | `@langchain/openai`, `form-data` | `{}` | correction 2.4/2.6 |
| `overrides.langsmith` | present | removed | no longer needed once `@langchain/openai` goes |
| `peerDependencies` | `n8n-workflow: ">=1.0.0"` | `n8n-workflow: ">=2.13.0 <3.0.0"`, `@n8n/ai-node-sdk: ">=0.8.0 <0.9.0"` | scope to tested versions; add SDK peer per Sprint 2.4 |
| `n8n.nodes[]` | 3 entries incl. embeddings | 2 entries (embeddings removed) | Sprint 2.1 |
| `n8n.credentials[]` | 1 entry | same | ✓ |

### 2.8 Update Jest tests

- `TokenSenseChatModel.test.ts`: mock `supplyModel`; assert `modelConfig` shape (baseUrl ends `/v1` exactly once, apiKey set, `additionalParams.metadata` matches).
- `TokenSenseAi.test.ts`: mock `this.helpers.httpRequestWithAuthentication`; assert `.body` contract for every op with `returnFullResponse: true`; confirm no manual `x-tokensense-key` or `Authorization` headers.
- `test/utils.test.ts`: `normalizeBaseUrl` cases + optional test that validates the credential `regexp` pattern rejects `/v1` endings.

**Acceptance:**
- `npm run lint` exits 0
- `npm test` passes; all `returnFullResponse: true` ops have the `.body` contract asserted
- `package.json` diff against HEAD adds/removes exactly what's listed in the 2.7 table
- No `@langchain/openai`, `form-data`, or `langsmith` anywhere
- No `main` field in `package.json`
- No manual auth header construction anywhere in `nodes/` or `shared/`

### Sprint 2 Commits

Single PR `Sprint 2: scanner-clean refactor`:
- `chore: relocate TokenSenseEmbeddings to future/ (deferred to v0.2.0)`
- `feat: add authenticate block + bare-origin validator to TokenSenseApi credential`
- `feat: add normalizeBaseUrl helper with tests`
- `feat: migrate TokenSenseChatModel to @n8n/ai-node-sdk supplyModel`
- `refactor: migrate TokenSenseAi to httpRequestWithAuthentication + assert .body contract`
- `feat: replace form-data with n8n built-in multipart in transcribeAudio`
- `chore: remove main field + @langchain/openai + form-data + langsmith override`
- `chore: pin @n8n/ai-node-sdk peer range to 0.8.x`
- `test: assert response.body contract for every returnFullResponse op`
- `docs: update README with bare-origin endpoint and v0.1.0 scope`

---

## Sprint 3 — Packed Tarball + Scanner + Publish Prep

**Duration:** ~90-120 min
**Goal:** Green locally + packed + scanner-clean + installs against a clean n8n runtime. Multiple mandatory gates.

### 3.1 Green path

```bash
npm run lint     # 0
npm run build    # clean
npm test         # all pass
npm pack --dry-run --json > /tmp/pack-report.json
```

### 3.2 Tarball content verification

From `/tmp/pack-report.json`:

**INCLUDED:** `package.json`, `LICENSE`, `README.md`, `dist/nodes/TokenSenseAi/TokenSenseAi.node.js`, `dist/nodes/TokenSenseChatModel/TokenSenseChatModel.node.js`, `dist/credentials/TokenSenseApi.credentials.js`, `dist/icons/tokensense.svg` (or top-level `icons/tokensense.svg`).

**EXCLUDED:** `node_modules/`, `.github/`, `docs/`, `test/`, `nodes/` (source), `credentials/` (source), `shared/` (source), `future/`, `*.test.ts`, `*.test.ts.bak`, `eslint.config.mjs`, `jest.config.js`, `tsconfig.json`.

**Correction #5 verification:** Confirm the tarball does not contain a `dist/index.js` — and that `package.json` has no `main` field. If either is present, fix before publishing.

Size < 100KB.

### 3.3 Icon path check

```bash
npm pack  # produces n8n-nodes-tokensense-0.1.0.tgz
tar -tzf n8n-nodes-tokensense-0.1.0.tgz | grep icons
tar -xzf n8n-nodes-tokensense-0.1.0.tgz --to-stdout \
  package/dist/nodes/TokenSenseAi/TokenSenseAi.node.js | grep -m1 "icon:"
```

If descriptor path and packed path disagree, fix descriptor to `file:icons/tokensense.svg`.

### 3.4 (GATE) Packed-tarball clean-install smoke test — MANDATORY

**Correction (v6):** Use the documented community-node install path `~/.n8n/nodes` (what n8n's GUI installer uses), NOT `N8N_CUSTOM_EXTENSIONS`. The custom-extensions env var proves only that n8n can load *an* extension from an arbitrary path — it does not reproduce how self-hosted users install community nodes. Using the documented path removes a potential false-green.

Preferred — Docker:

```bash
docker run --rm -d \
  --name n8n-smoke \
  -v "$PWD/n8n-nodes-tokensense-0.1.0.tgz:/tmp/pkg.tgz" \
  -p 5678:5678 \
  n8nio/n8n:latest sh -c '
    mkdir -p /home/node/.n8n/nodes &&
    cd /home/node/.n8n/nodes &&
    npm init -y >/dev/null &&
    npm install /tmp/pkg.tgz &&
    exec n8n start
  '

# Wait for n8n to boot
until curl -fsS http://localhost:5678/healthz >/dev/null 2>&1; do sleep 3; done

# Browser-side verification (Cowork drives via Chrome)
open http://localhost:5678
```

Fallback — fresh n8n install on the Mac (same install path):

```bash
mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes
npm init -y >/dev/null
npm install /path/to/n8n-nodes-tokensense-0.1.0.tgz
npx n8n start   # or use a pre-existing n8n install
```

**Four sub-gates — all must pass:**

1. **Package installs.** `npm install .../n8n-nodes-tokensense-0.1.0.tgz` exits 0 with no peer-dep errors.
2. **Both nodes appear.** In the n8n UI → add-node search for "TokenSense": both `TokenSense AI` and `TokenSense Chat Model` are listed. Icons render.
3. **AI Agent + Chat Model sub-node works.** Build: Manual Trigger → AI Agent. Connect `TokenSense Chat Model` to the Agent's Chat Model socket. Create `TokenSenseApi` credential (endpoint `https://api.tokensense.io`, valid API key). Run. Agent responds.
   - Verify in TokenSense Dashboard → Logs: a row with `source = n8n-nodes-tokensense`, `workflow_tag`, `project`, `provider`.
4. **TokenSense AI general node works.** Drop a `TokenSense AI` node with the `chatCompletion` operation. Same credential. Run. Output contains completion text.
   - Verify metadata fields in TokenSense logs.

Record outcome in `docs/audits/sprint-3-smoke-test-2026-04-19.md`.

**Pass:** all four sub-gates green.
**Fail:** Stop. Do NOT tag v0.1.0. Diagnose, fix, repack, retest.

### 3.5 (GATE) Scanner pre-publish

**Correction #7 applied.** Current scanner behaviour depends on the version:

```bash
# Try local-tarball inspection first (some scanner versions support it)
npx @n8n/scan-community-package ./n8n-nodes-tokensense-0.1.0.tgz || true
# If that errors with "unsupported target" or "expects package name",
# the scanner only works against a published npm package.
```

**Decision matrix:**

| Scanner behaviour | Action |
|-------------------|--------|
| Accepts local `.tgz` and reports clean | Proceed to tag `v0.1.0` directly |
| Accepts local `.tgz` and reports findings | Fix findings, repack, rerun, re-smoke-test |
| Rejects local `.tgz` (requires published package) | **Beta-first publish** (see Publish Procedure below): publish `0.1.0-beta.1`, scan, if clean publish `0.1.0` from the same source tree (version-only commit); if not, fix + repeat |

Record scanner output in `docs/audits/sprint-3-scanner-2026-04-19.md`.

### 3.6 Package name availability

```bash
npm view n8n-nodes-tokensense
# Expected: E404 (unless beta-first has already published 0.1.0-beta.1)
```

### 3.7 README final polish

Covers:
- One-liner
- Install (v0.1.0): **"Installable from npm on self-hosted n8n via Settings → Community Nodes → Install → `n8n-nodes-tokensense`."** No Cloud / verified-panel claim.
- Credential setup — bare-origin endpoint (no `/v1`), API key from app.tokensense.io/keys
- AI Agent + Chat Model example
- TokenSense AI general node example
- Embeddings: use general node's Embeddings operation or HTTP Request; native LangChain Embeddings sub-node in v0.2.0
- GitHub link
- MIT license

### 3.8 Dry-run publish

```bash
npm whoami
npm publish --provenance --access public --dry-run
```

---

## Carlo's Manual Steps

Complete:
- ✅ GitHub PAT `carlo-ops-dashboard-v2` has `workflow` scope
- ✅ npm Granular Access Token (Bypass-2FA, 30-day expiry)
- ✅ `NPM_TOKEN` in repo secrets (2026-04-19 04:33 UTC)

Trusted Publishers — deferred to v0.2.0 (same ladder as v3/v4).

---

## Publish Procedure (Beta-First if Required)

**Default path (scanner accepted local tarball or we're skipping local scanner check):**

```bash
gh pr merge <sprint-2-pr-number> --squash
git checkout main && git pull
git tag v0.1.0
git push origin v0.1.0
gh run watch
```

**Beta-first path (triggered only if Sprint 3.5 required a published package):**

```bash
# From the merged main, with version already set to 0.1.0-beta.1 in a follow-up commit
npm version 0.1.0-beta.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: pre-publish scanner inspection — 0.1.0-beta.1"
git tag v0.1.0-beta.1
git push origin main v0.1.0-beta.1
gh run watch   # publish.yml publishes 0.1.0-beta.1 with --tag beta

# Scan the published beta
npx @n8n/scan-community-package n8n-nodes-tokensense@0.1.0-beta.1

# If clean, promote to 0.1.0 from the same source tree (version-only commit, no code changes)
npm version 0.1.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "release: v0.1.0"
git tag v0.1.0
git push origin main v0.1.0
gh run watch
```

Important for beta-first: the `publish.yml` workflow must publish pre-release tags under the `beta` dist-tag, not `latest`, to prevent users pulling the beta via `npm install n8n-nodes-tokensense`. Add to workflow:

```yaml
- run: |
    if [[ "${GITHUB_REF_NAME}" == *-beta.* || "${GITHUB_REF_NAME}" == *-rc.* ]]; then
      npm publish --provenance --access public --tag beta
    else
      npm publish --provenance --access public
    fi
```

**If publish fails (both paths):** Same recovery ladder as v4 — auth, provenance permissions, version collision, test failure.

---

## Post-Publish

### Immediate
1. Re-run `npx @n8n/scan-community-package n8n-nodes-tokensense` against the published `0.1.0` → archive output. Scanner run is informational; verified status for AI nodes requires confirmation from n8n, not assumed.
2. Fresh install from npm into a clean n8n → verify live package matches the tarball.
3. AI Agent workflow with TokenSense Chat Model → verify ICP scenario end-to-end.

### Within 48 hours
4. Connect page update in Dashboard (self-hosted n8n framing).
5. SecondBrain `n8n Community Node.md` → status `published-v0.1.0` + npm link.
6. Repo `docs/STATUS.md`.
7. Memory: mark `project_n8n_integration_gap.md` resolved.

### Within 1 week
8. n8n forum post.
9. Tweet/LinkedIn.
10. Blog post.
11. v0.2.0 plan (embeddings + Trusted Publishers).

---

## Open Risks

### R1 — `n8n-node-cli` layout incompatibility
**Probability:** Medium
**Impact:** +30-60 min (decide Path A vs. Path B)
**Mitigation:** Sprint 1.2 compat gate; Path B keeps v0.1.0 on raw `tsc`+`eslint`.

### R2 — `additionalParams.metadata` filtered by SDK 0.8.x
**Probability:** Low-Medium
**Impact:** Blocks v0.1.0 — stop and replan per correction #8 (carried from v4)
**Mitigation:** Sprint 0.2 + 0.5 catch this before Sprint 1.

### R3 — Multipart upload via `httpRequestWithAuthentication`
**Probability:** Low-Medium
**Impact:** +1 hour
**Mitigation:** Fallback ladder in § 2.6. Sprint 2.8 contract test fails loudly if `.body` is wrong.

### R4 — Scanner rejects published tarball
**Probability:** Low
**Impact:** Republish as `0.1.1`
**Mitigation:** Sprint 3.4 smoke + 3.5 scanner (local or beta-first).

### R5 — Icon path mismatch after pack
**Probability:** Low
**Impact:** Cosmetic
**Mitigation:** Sprint 3.3 verifies.

### R6 — n8n-workflow peer too tight
**Probability:** Low
**Impact:** Install warnings
**Mitigation:** Widen in patch release if reported.

### R7 — SDK bumps to 0.9.x before publish
**Probability:** Medium
**Impact:** Peer-dep warning
**Mitigation:** Re-run Sprint 0.3/0.4 on publish day; widen peer post-verify.

### R8 — Credential-test expression engine rejects even a single `.replace()`
**Probability:** Low-Medium
**Impact:** Declarative test fails
**Mitigation:** Regex validator on the endpoint property blocks `/v1` inputs, so `{{$credentials.endpoint}}/v1/models` is unambiguous and the `.replace()` isn't needed. Final fallback: remove the `.replace()` and rely on the regex alone.

### R9 — Sprint 3.4 smoke test can't run
**Probability:** Low
**Impact:** Hard blocker — no publish
**Mitigation:** Docker Desktop OR fresh-npm-install on the Mac.

### R10 — Node 22 incompatibility at runtime or in n8n-node-cli
**Probability:** Low (n8n usually runs on Node 20+; Node 22 is LTS since 2024-10)
**Impact:** CI fails; drop to Node 20
**Mitigation:** Sprint 0.6 decides CI Node version from n8n's declared `engines.node`.

### R11 — Scanner only accepts published packages
**Probability:** Medium
**Impact:** Beta-first publish flow adds 15-30 min
**Mitigation:** Sprint 3.5 detection matrix; `publish.yml` tag-routing for betas.

---

## Success Criteria

- [ ] Sprint 0 gates 0.1, 0.2, 0.3, 0.5, and 0.6 all pass; 0.4 peer-range decision recorded. All documented in `docs/audits/sprint-0-feasibility-2026-04-19.md`
- [ ] Sprint 1.2 compat decision recorded (Path A or Path B)
- [ ] `n8n-nodes-tokensense@0.1.0` published to npm with provenance badge
- [ ] Package installable from npm on self-hosted n8n (**not claiming Cloud / verified-panel availability**)
- [ ] `TokenSense Chat Model` connects to AI Agent and executes tool-calling workflows
- [ ] `TokenSense AI` passes all 8 operations end-to-end with metadata in TokenSense logs
- [ ] Zero external runtime dependencies (`"dependencies": {}`)
- [ ] `package.json` retains `keywords` (includes `n8n-community-node-package`), `repository`, `homepage`, `bugs`, `engines`, `n8n.nodes[]`, `n8n.credentials[]`
- [ ] `package.json` has NO `main` field; tarball has NO `dist/index.js`
- [ ] Every `returnFullResponse: true` op has a Jest test asserting `.body` is read
- [ ] `npm pack` tarball contains only `dist`, `icons`, `README.md`, `LICENSE`, `package.json`; excludes everything else listed in 3.2
- [ ] Sprint 3.4 packed-tarball smoke test passes (all 4 sub-gates)
- [ ] Sprint 3.5 scanner check performed against either local `.tgz` or `0.1.0-beta.1`
- [ ] CI green on Node 22 (or Node 20 per Sprint 0.6 decision)
- [ ] SecondBrain vault + `docs/STATUS.md` updated
- [ ] v0.2.0 follow-up ticket opened for embeddings + Trusted Publishers (+ custom `BaseChatModel` only if future metadata patterns demand it)

**North-star (30 days post-publish):**
- First 5 external self-hosted n8n users install from npm
- Zero Critical/High security issues
- Blog + forum → >500 tokensense.io visits from n8n ecosystem
