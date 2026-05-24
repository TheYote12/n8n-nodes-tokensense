# Changelog

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
