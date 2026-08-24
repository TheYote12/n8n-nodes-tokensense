# Changelog

## Unreleased

### Structured error envelope survives the node boundary

- **`NodeApiError` no longer swallows the TokenSense error envelope.** `TokenSenseAi` now passes `message`, `description` and `httpCode` overrides when wrapping a failed request, so n8n's canned per-status strings (`"Payment required - perhaps check your payment details?"` for 402, `"Service unavailable - try again later ..."` for 503) no longer replace the real body. The envelope is parsed defensively from `error.response.body.error`, `error.response.data.error` and `error.error`, since the path varies by n8n version and transport.
- **`continueOnFail()` emits a structured error.** `$json.error` is now an object — `{ message, code, error_class, retryable, retry_after_seconds, http_status, scope }`, plus `budget_usd`/`spent_usd` when the API sends them — so a workflow can branch on `$json.error.error_class`. It used to be a bare message string; that string is still available at `$json.errorMessage`.
- **Chat-model path preserved too.** `TokenSenseChatModel` supplies the model via `supplyModel`, whose errors go through the LangChain agent rather than `execute()`. It now passes an `onFailedAttempt` hook that throws a pre-built `NodeApiError` on terminal attempts, which `@n8n/ai-node-sdk` returns verbatim. Retry behaviour is unchanged. Known gap: the `ai_languageModel` connection has no data output, so the envelope survives as message + description text only, not as branchable `$json`.

## v0.1.15 — 2026-07-23

### n8n verification (scanner-compatible SDK manifest)

- Changes `n8n.aiNodeSdkVersion` to the integer `1`, matching the current `@n8n/community-nodes/ai-node-package-json` scanner rule and `@n8n/node-cli` AI node templates.

## v0.1.14 — 2026-07-23

### n8n verification (provenance publish)

- Re-publishes the `aiNodeSdkVersion` manifest fix via the GitHub Actions provenance workflow so n8n's community package scanner can verify npm provenance.

## v0.1.13 — 2026-07-22

### n8n verification (re-review fix)

- **`aiNodeSdkVersion` in the `n8n` manifest block (required).** Added `"aiNodeSdkVersion": "0.7.0"` to the `n8n` object in `package.json`, alongside `n8nNodesApiVersion`. n8n uses this field to know which `@n8n/ai-node-sdk` version the `TokenSenseChatModel` sub-node was built against; the peer dependency stays `"*"` (per the SDK README) so the host still supplies the runtime copy.

## v0.1.12 — 2026-07-22

### n8n verification (re-review fix)

Addresses the two required fixes plus the recommendation from n8n's re-review of v0.1.11:

- **`itemIndex` on `NodeApiError` (required).** `TokenSenseAi.node.ts` now throws `new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i })` inside the per-item loop, so n8n can associate a failure with the specific input item that triggered it.
- **`@n8n/ai-node-sdk` declared as a peer dependency (required).** The `TokenSenseChatModel` sub-node imports `supplyModel` from `@n8n/ai-node-sdk` at runtime (the build externalises it — `dist` keeps the `require(...)`), but it was only listed under `devDependencies`. Added `"@n8n/ai-node-sdk": "*"` to `peerDependencies`, matching n8n's official ai-node-sdk README, so n8n supplies whatever SDK version it ships (currently 0.21.x) without unmet-peer warnings. The build target stays pinned at `0.7.0` in `devDependencies`.
- **Alphabetised "Size" options (recommended).** Reordered the image Size dropdown to `1024x1024`, `1024x1792`, `1792x1024`. Display order only — default (`1024x1024`) and values unchanged.

## v0.1.11 — 2026-07-16

### n8n verification (re-review fix)

Addresses the three required fixes plus the recommendation from n8n's re-review of v0.1.10:

- **`pairedItem` on all output items (required).** Added `pairedItem: { item: i }` to all nine `returnData.push({...})` calls in `TokenSenseAi.node.ts` so n8n's execution UI can trace each output item back to its source input.
- **`subtitle` on both nodes (required).** Added `subtitle: "={{$parameter.resource + ': ' + $parameter.operation}}"` to `TokenSenseAi` and `subtitle: 'Chat Model'` to `TokenSenseChatModel`.
- **`NodeConnectionTypes` enum (required).** Replaced string literals with typed enum values: `inputs`/`outputs` now use `NodeConnectionTypes.Main` in `TokenSenseAi`, and `outputs` uses `NodeConnectionTypes.AiLanguageModel` in `TokenSenseChatModel`.
- **Themed icon variants (recommended).** Both nodes now use `icon: { light, dark }` with new `tokensense-light.svg` (deep indigo→violet for light theme) and `tokensense-dark.svg` (brighter indigo→violet for dark theme). The credential icon is unchanged.

## v0.1.10 — 2026-07-15

### Release

- **Republish with npm provenance.** No code changes from v0.1.9 — this release exists solely to publish through the GitHub Actions workflow (`npm publish --provenance` via OIDC), which attaches a signed npm provenance statement. n8n community-node verification now requires the submitted version to be published with provenance; v0.1.9 was published locally and therefore lacked it. All v0.1.9 fixes (removed unregistered embeddings node, singular `model` resource) carry forward unchanged.

## v0.1.9 — 2026-07-15

### n8n verification (re-review fix)

- **Removed unregistered node file:** Deleted `future/TokenSenseEmbeddings.node.ts` and `future/TokenSenseEmbeddings.test.ts.bak`. The file was an unregistered `*.node.ts` (no entry in `package.json` `n8n.nodes`) that imported `@langchain/openai`, which is not a declared dependency — flagged as the required fix in n8n re-review. Work-in-progress embeddings code is preserved on the `wip/embeddings` branch. (Note: the file was never in the published npm tarball — `tsconfig` excluded `future/` and only `dist/` ships — so this is a repository cleanup, not a packaging change.)
- **Singular resource value:** Renamed the `Model` resource `value: 'models'` → `'model'` in `TokenSenseAi.node.ts` (option definition + operation `displayOptions`), per n8n UX guidelines for singular resource values. Test assertion updated to match. No behavioural change to the List Models operation.

## v0.1.8 — 2026-06-23

### n8n verification (re-review fix)

- **TokenSenseAi.node.ts:** Fixed invalid `codex` categorisation on the standalone node. A normal node (main→main) cannot use `categories: ['AI']` / `subcategories` — those are reserved for AI sub-nodes. Changed to `categories: ['Utility']` and removed `subcategories`. Resolves the 2026-06-18 manual-review block. The `TokenSense Chat Model` sub-node (a true `ai_languageModel` node) is unchanged. No behavioural change — `usableAsTool: true` still surfaces the node in the AI Tools list.

### Docs

- **README:** Refreshed example model names to current generation (Claude Opus 4.8, Gemini 3.5 Flash); replaced retired DALL-E 3 image example with Imagen 4.

## v0.1.6 — 2026-05-27

### n8n verification fixes

- **package.json:** `peerDependencies.n8n-workflow` widened to `"*"` per n8n verification rules (host always provides a compatible version at runtime)
- **package.json:** Removed `@n8n/ai-node-sdk` from `peerDependencies`; kept pinned in `devDependencies` for builds and typing. Host n8n bundles the SDK at runtime.
- **TokenSenseAi.node.ts:** HTTP errors in `execute()` now surface via `NodeApiError` (with structured request/response context) instead of being re-thrown raw. Matches n8n UX guidelines.

### URL polish

- **package.json `homepage`:** Now points to `https://tokensense.io/integrations/n8n` (was the GitHub repo)
- **`codex.resources.primaryDocumentation` on both shipped nodes:** Now points to `https://tokensense.io/docs/integrations/n8n/reference` (was the GitHub repo)
- `repository.url` and `bugs.url` remain on GitHub — those are correct.

### Hygiene

- `.gitignore` now excludes `*.tgz`
- Removed stray `n8n-nodes-tokensense-0.1.0-beta.2.tgz` test artifact from April

## v0.1.5 — 2026-05-24

### Metadata cleanup

- **package.json:** Rewrite description to lead with benefit ("Track AI costs per workflow in n8n") instead of implementation detail
- **package.json:** Remove `proxy` and `ai-gateway` keywords; replace with `cost-tracking` and `budget`
- **No code changes** — metadata only

## v0.1.4 — 2026-05-06

### Docs

- **README:** Updated model references to current generation (GPT-5.5, Claude Opus 4.7, Gemini 3 Flash, GPT Image 2)

## v0.1.3 — 2026-05-06

### Model currency update

- **Default models:** Updated from GPT-4o to GPT-4.1 Mini across all nodes (GPT-4o still supported, just no longer the default)
- **Native Anthropic:** Added Claude Opus 4.7, Opus 4.6, Sonnet 4.6, Opus 4.5, Haiku 4.5
- **Native Gemini:** Migrated from Gemini 2.0 Flash (shutting down June 1) to Gemini 3 Flash Preview default; added full 3.x and 2.5 lineup with retirement annotations
- **Image generation:** Added GPT Image 2 as default image model
- **TTS voices:** Added 7 new OpenAI voices (ash, ballad, cedar, coral, marin, sage, verse) — now all 13 built-in voices
- **Fallback models:** Complete refresh — GPT-5.5, Claude Opus 4.7, Gemini 3.x models
- **No breaking changes** — all existing model selections continue to work

## v0.1.2 — 2026-05-06

### Marketplace readiness (pre-Creator Portal submission)

- **README:** Remove incorrect "TokenSense Embeddings" sub-node listing — embeddings is a Create Embedding operation on the general node, not a separate sub-node
- **README:** Rewrite description for marketplace clarity — plain language, pricing transparency, AI Tool variant and provider comparison sections added
- **Credentials:** `documentationUrl` now points to `https://tokensense.io/docs/integrations/n8n/setup` instead of GitHub repo
- **No code changes** to node logic — all 62 tests still pass, zero runtime dependency changes

## 0.1.1 — 2026-05-02

### Fixed
- **Lint:** `TokenSenseAi` node operations are now grouped under 5 resources (Chat, Image, Embedding, Audio, Models) to satisfy n8n's `resource-operation-pattern` UX guideline. No breaking changes — operation values are preserved.
- **Errors:** Replaced raw `throw new Error()` in `shared/utils.ts` with `NodeOperationError` per n8n's error UX guidelines (provides structured "what happened" + "how to fix").

### Notes
- Pre-verification polish ahead of n8n Creator Portal submission.
- All `@n8n/scan-community-package@0.15.0` security checks pass.
