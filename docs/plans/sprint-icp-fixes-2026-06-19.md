# Sprint Plan — Verification Unblock + ICP UX Fixes (2026-06-19, v2)

> **Status:** DRAFT — awaiting Carlo sign-off before any build/dispatch.
> **Author:** Cowork (orchestration). Consumed by: Claude Code.
> **Repos touched:** `n8n-nodes-tokensense` (primary), `tokensense` (one proxy endpoint for Gap 1).
> **v2 (2026-06-19):** Rewritten after a full grounding review of (a) the SecondBrain TokenSense vault, (b) the `tokensense` proxy + dashboard, (c) the node repo + the May 3 ICP audits. Corrections from that review are folded in and flagged inline as **[v2]**.

## Background / why now

n8n **approved** the node on 2026-05-29, then a **manual re-review on 2026-06-18 bounced it** over the `TokenSenseAi` codex categorisation (`categories: ['AI']` + `subcategories` on a *normal* node — invalid per the [codex reference](https://docs.n8n.io/integrations/creating-nodes/build/reference/node-codex-files/), which allows only ten standard categories). Reviewer (Garrit Franke) asked us to fix + **resubmit**.

> **[v2] Vault staleness flag (for Carlo):** the vault (`01 Projects/TokenSense/n8n Community Node.md`, `Decisions Log.md`) still records the node as `VERIFIED-approved-2026-05-29` and does **not** mention the 2026-06-18 re-bounce. The vault is the *why* source of truth, so this gap is worth correcting — recommend updating `n8n Community Node.md` status + adding a Decisions/Context note. This stale status is part of why the first pass under-scoped; flagging explicitly.

Verification/distribution is the lid (positioning doc: "Distribution is the lid"). Unblock it **first and fast** (Release 1), then ship the ICP UX work as a separate release (Release 2) that does not re-gate the verified shield.

## Release structure (recommended: two releases)

**Release 1 — v0.1.8 (codex fix only): ship immediately to unblock the resubmission.**
**Release 2 — v0.2.0 (ICP UX batch): ships after; normal npm version update, does not re-gate verification.**

> **Decision needed from Carlo:** two-release split (recommended) vs. one bundled v0.2.0 submission.

---

## Release 1 — v0.1.8 — Codex fix (resubmission unblock)

### R1.1 Fix invalid codex on the normal node
- **File:** `nodes/TokenSenseAi/TokenSenseAi.node.ts` (codex block ~L24)
  ```ts
  // BEFORE
  codex: {
    categories: ['AI'],
    subcategories: { AI: ['Language Models'] },
    resources: { primaryDocumentation: [{ url: 'https://tokensense.io/docs/integrations/n8n/reference' }] },
  },
  // AFTER
  codex: {
    categories: ['Utility'],
    resources: { primaryDocumentation: [{ url: 'https://tokensense.io/docs/integrations/n8n/reference' }] },
  },
  ```
  - `['Utility']` (valid standard category). Alternatives: `Development`, `Productivity`. **Carlo's pick.**
  - Delete the `subcategories` line. Keep `resources`. **Do NOT touch `usableAsTool: true`** (L23) — Tool-list discoverability comes from this flag, not the codex.
  - **[v2] Update the description test:** `test/TokenSenseAi.test.ts` asserts on `.codex`; the category-change will need the assertion updated (it currently checks the description shape). Keep "defines exactly 8 operations / 5 resources" assertions intact.

### R1.2 Leave the AI sub-nodes alone
- `TokenSenseChatModel.node.ts` (`outputs: ['ai_languageModel']`) — legitimate AI sub-node; codex AI categorisation is the established pattern. **No change.**
- `future/TokenSenseEmbeddings.node.ts` — not registered, not shipped. **No change.**
- **Optional:** confirm `'Chat Models'` is a valid AI subcategory in current n8n source (public codex ref doesn't document it; it passed prior reviews, so low risk).

### R1.3 Version + publish + resubmit
1. Bump `package.json` `version` → `0.1.8`. (Local is `0.1.7`; npm `latest` is `0.1.6` — the v0.1.7 cosmetic commits, icon + README model-name refresh, were never tagged; folding them into v0.1.8 is correct and intended per the vault's "fold into next bump" note.)
2. CHANGELOG entry for v0.1.8 (codex fix + carried-forward v0.1.7 cosmetic refresh).
3. `npm run build` + `npm test` (currently ~70 tests; codex is metadata — only the description test needs updating).
4. `npx @n8n/scan-community-package@latest n8n-nodes-tokensense` against the tarball — expect 0 problems.
5. **Publish (Carlo-gated):** push `v0.1.8` tag → CI `publish.yml` publishes to npm `latest` (tag without `-` → `latest`).
6. **Resubmit (Carlo-gated):** resubmit in Creator Portal; reply to Garrit confirming fix + resubmission.

### R1 Acceptance
- `TokenSenseAi` codex = valid standard category + `resources`, no `subcategories`; sub-nodes untouched.
- Build clean, tests green (description test updated), scan 0 problems.
- npm `latest` = `0.1.8`; resubmitted; reply sent to nodes@n8n.io.

---

## Release 2 — v0.2.0 — ICP UX batch

> **[v2] All four originally-planned fixes are confirmed genuine, audit-blessed, still-open items** (May 3 audits `docs/audits/n8n-node-ux-icp-walkthrough-2026-05-03.md` + `n8n-node-product-readiness-2026-05-03.md`). Three were the audits' top-bumped ICP priorities and never shipped across v0.1.1→v0.1.7 (verification-lint + cosmetic only). The grounding review corrected the technical details below and surfaced a few additional cheap ICP wins.

### Gap 1 — Project picker (biggest agency gap) — CROSS-REPO

**Problem:** `project` is free text (`type: 'string'`) in both nodes (TokenSenseAi ~L168, ChatModel ~L65). Agencies typo client names → one client fragments into multiple dashboard projects → per-client attribution (their core reason to buy) silently breaks. **[v2] Sharper justification:** the proxy's `resolveProject` (Proxy/index.js ~L305) matches `metadata.project` against **`slug` OR `id` only — never display name**. So today's free-text field already mostly fails unless the user happens to type the exact slug.

**Backend prerequisite (tokensense repo) — confirmed net-new, must build:**
- Proxy has **no** project route (only `/v1/models`, chat, messages, responses, embeddings, images, audio, `/health`). Dashboard `app/api/projects` is **Supabase-session auth — unreachable by an API key.** So add `GET /v1/projects` to the proxy.
- **File:** `tokensense/Proxy/index.js`, register near `/v1/models` (~L237). **[v2] Exact pattern** (the `onRequest` hook only auths POST, so call auth inline like `/v1/models`):
  ```js
  fastify.get('/v1/projects', async (request, reply) => {
    const authResult = await authenticateApiKey(
      request.headers.authorization, request.headers['x-tokensense-key'],
      request.headers['x-api-key'], request.query?.key, request.headers['x-goog-api-key']);
    if (!authResult?.ok) { /* INVALID_API_KEY / API_KEY_EXPIRED / PAYMENT_REQUIRED via sendError */ }
    const { data, error } = await supabase            // service-role client (./supabaseClient)
      .from('projects')
      .select('id, slug, name, color, description, archived_at')
      .eq('workspace_id', authResult.workspaceId)     // tenant scope — NEVER from request input
      .is('archived_at', null)
      .order('created_at', { ascending: true });
    if (error) return /* 500 via sendError */;
    return { object: 'list', data: data || [] };
  });
  ```
  - `projects` columns: `id, workspace_id, name, slug, budget_usd, color, archived_at, created_at, description`; `UNIQUE(workspace_id, slug)`.
  - Service-role client bypasses RLS, so the `workspace_id` filter is the only tenant guard — keep it mandatory and key-derived (consistent with memory `project_rpc_security_grants`).
  - CORS already allows GET.

**Node change (both nodes):**
- Add `getProjects` loadOptions in `shared/utils.ts` mirroring the model loader; map to `{ name: project.name, value: project.slug }` (**value = slug**, since `resolveProject` matches slug/id).
- Convert `project` to a **`resourceLocator`** with `From list` (loadOptions) + `By name/ID` (string/expression) modes — `resourceLocator` (not plain `options`) is required so existing saved workflows with a free-text string don't break. **[v2] Verify** existing string values deserialize into the string mode before publish.
- **[v2] Keep it on Layer-1 body metadata** (per the locked "Four-Layer Attribution" decision, 2026-05-06). `buildMetadata` already injects `project` into the request body — do not move it to a header.
- **Files:** both node files + `shared/utils.ts` (+ tests: add a `project`-key assertion in `utils.test.ts`, currently absent).
- **Acceptance:** valid creds → populated project dropdown; manual/expression entry still works; selecting routes logs to that project (verify end-to-end in Docker n8n); proxy endpoint deployed to prod **before** node release.

### Gap 2 — Reframe enforcement errors as features (agencies + ops) — **[v2] codes corrected**

**Problem:** `execute()` catch (TokenSenseAi.node.ts ~L886) throws a generic `NodeApiError` for everything; the enforcement moment (the product's whole point) looks like a crash.

**[v2] The proxy's actual error contract** (all via `Proxy/errors.js sendError` → `{ error: { code, message, type, ...extra } }`), so detect on the machine-readable `error.code`:

| Condition | HTTP | `code` | `type` | extra |
|---|---|---|---|---|
| Workspace budget cap | **402** | `BUDGET_EXCEEDED` | `billing_error` | `budget_usd, spent_usd` |
| Project budget cap | **402** | `PROJECT_BUDGET_EXCEEDED` | `billing_error` | `project_id, budget_usd, spent_usd` |
| Per-key budget cap | **402** | `KEY_BUDGET_EXCEEDED` | `billing_error` | `budget_usd, spent_usd` |
| Rate limit | **429** | `RATE_LIMITED` | `rate_limit_error` | `limit_per_minute, retry_after_seconds` (+ `Retry-After` header) |
| Invalid/revoked key | **401** | `INVALID_API_KEY` | — | — |
| Expired key | **401/403** | `API_KEY_EXPIRED` | — | `expired_at` |
| Missing provider key | **403** | `MISSING_PROVIDER_KEY` | `authorization_error` | `provider` |

**[v2] Critical distinctions (do NOT conflate — this re-introduces a bug the team deliberately fixed in the "Error Code Cleanup" decision, 2026-05-06):**
- **402 = a hard budget cap the user set was hit.** Reframe as the guardrail working, not an error. Agency: *"TokenSense budget for project '<slug>' is exhausted — the cap you set is holding."* Ops: *"Your monthly AI budget cap is hit — exactly what you configured."* Include the project/tag when present.
- **429 = rate limit, NOT budget.** Reframe separately: *"Too many requests — retry after <n>s."*
- **Quota exhaustion does NOT error** (soft wall — requests keep flowing, logging stops). Never message a quota event as a block. Only **degraded mode = 503** (`SERVICE_DEGRADED`).
- **[v2] Fold in E1 (401/403 mid-execution)** — same catch wrapper, ~same effort: invalid/expired key surfaces a clear "check your TokenSense key" message; `MISSING_PROVIDER_KEY` surfaces "add your <provider> key in TokenSense."
- **[v2] Tolerate two non-standard shapes:** policy-block 403 uses `type: "routing_policy_error"` + a `tokensense` block (not `sendError`); one streaming 503 path sends `{ error: "<string>" }` (plain string). Don't crash on these.

- **Files:** TokenSenseAi `execute()` catch (~L886), ChatModel error path, shared helper in `shared/utils.ts`; preserve `continueOnFail()`. Add unit tests for status/code→message mapping.

### Gap 3 — Surface credential errors at config time (solo builders)

**Problem:** `loadModels` (`shared/utils.ts` ~L118) ends `catch { return fallback ?? DEFAULT_MODELS }` — a bare catch with **no error inspection**, so a 401/403 from a bad key silently returns the static model list. Solo builder pastes a wrong key, everything looks fine, fails cryptically at runtime. (Audit: "the most damaging single bug class for solo builders.")

**Change:** in the catch, inspect status — **rethrow auth errors (401/403) as `NodeOperationError`** with a setup-time message ("TokenSense couldn't authenticate — check your API key/endpoint in the credential."); only fall back to `DEFAULT_MODELS` for transient/network failures. **[v2]** The credential test already catches obvious bad keys at config time via `GET /v1/models`; this closes the *dropdown-load* path specifically. (Mid-execution 401/403 is covered in Gap 2.)
- **File:** `shared/utils.ts` (~L90–120). Add unit test for the auth-vs-transient branch.

### Gap 4 — **[v2] Finish the README** (was "add transparency" — partly already shipped)

**[v2] Already present** (v0.1.2 rewrite): pricing/markup line, AI Tool variant section, provider-override section, current model names. **What genuinely remains:**
- **Free-tier request number** — README says "Free tier available" but not the figure. Tier limits (confirmed in `Proxy/quota.js`): Starter 10K, Pro 50K, Agency 1M req/mo. Add "10K requests/month free."
- **[v2] Pricing $ is uncertain — verify before publishing.** README currently says "$29/month"; the vault Decisions Log (Tier Structure, April 2026) says **Starter $19/mo**. Do not publish a number until confirmed against live billing (`Dashboard/lib/billing/entitlements.ts` / Stripe / pricing page). **Flag for Carlo.**
- **ICP callouts** (A2/B2): short "Built for agencies / ops teams / solo builders" framing.
- **[v2] Cost-in-execution-view line (B3, ~5 min, high leverage):** the node already returns `cost`/`step`/`execution_id` in its output JSON, but the README never tells users to look there. Add one line — direct conversion lift for ops + solo.
- **Defer (post-verification, lower priority):** screenshots (S3), competitor comparison table (P1), Cloud-vs-self-hosted install + troubleshooting (S1/C3).
- Carry forward the v0.1.7 model-name refresh (already in current README per review).
- **File:** `README.md`.

### Gap 5 (NEW, optional) — **[v2] Quota-remaining visibility**

Both 2026-06-14 ICP content briefs want a proactive quota signal (solo: "quota badge — how close am I"; ops: "spend trends"). The proxy already emits `X-TokenSense-Quota-Used/Limit/Remaining/Status` headers on responses. The node could surface "remaining quota" in output metadata and/or in the reframed errors. Cheap, on-ICP, not in the original four. **Candidate — Carlo's call whether to include in v0.2.0 or defer.**

### R2 Version + publish
1. Bump `version` → `0.2.0` (minor: new field behaviour + UX).
2. CHANGELOG for v0.2.0.
3. `npm run build` + `npm test` (extend tests for Gaps 1–3) green; scan 0 problems.
4. **Publish (Carlo-gated):** push `v0.2.0` tag → CI publishes `latest`. No re-verification gating.
5. **Sequencing:** proxy `GET /v1/projects` PR must merge + Railway-deploy to prod **before** the node release, or Gap 1's dropdown is dead.

---

## Cross-cutting

### Pre-flight (per CLAUDE.md)
- `git branch --show-current` (currently `claude/n8n-icon-png-b5ddd6`), `git branch -a --sort=-committerdate | head -20`, `gh pr list`.
- **Open PR #20** ("v0.1.7 icon + README") sits on the current branch, unmerged. **Decision:** fold its content into the v0.1.8 cut (recommended — it carries the icon + README refresh) and supersede/close #20, or merge #20 first then branch. **Carlo's call.**
- Branches: `claude/codex-fix-v018-<id>` (R1), `claude/icp-ux-v020-<id>` (R2 node), `claude/proxy-v1-projects-<id>` (Gap 1 backend, tokensense repo).

### Sequencing
1. R1 (v0.1.8 codex) → publish → resubmit → approval.
2. Proxy `GET /v1/projects` (tokensense) → PR → merge → Railway deploy.
3. R2 (v0.2.0 node ICP batch) → publish.

### Decisions needed from Carlo
1. Two-release split (recommended) vs bundle.
2. PR #20: fold vs merge-first.
3. Codex category: `Utility` (default) / `Development` / `Productivity`.
4. README price: confirm Starter $ (vault says $19, README says $29) — verify live before publishing.
5. Include Gap 5 (quota visibility) in v0.2.0 or defer.

### Risks / verify-before-build
- **Proxy error shape** for 402/429 — table above is from source; re-confirm against a live 402/429 response before coding Gap 2 detection.
- **`resourceLocator` migration** — confirm existing string `project` values deserialize cleanly.
- **`/v1/projects` deploy ordering** — proxy first, node second.
- **Pricing number** — don't hardcode a stale price.
- **`engines.node >=22.16`** (package.json) — audit flagged the strict floor may warn on Node 20 self-hosted; out of scope but note.
- **Image-model dropdown** still lists DALL-E 2/3 "(Deprecated)" — cosmetic, optional cleanup.

### Effort (rough)
- R1 codex: ~15 min + build/scan/publish/resubmit.
- Gap 1: proxy endpoint ~1h + node resourceLocator/getProjects ~1–2h.
- Gap 2 (incl. E1 401/403): ~1–1.5h + tests.
- Gap 3: ~30 min + test.
- Gap 4: ~45 min (excl. screenshots/comparison table).
- Gap 5 (optional): ~30–45 min.

### Out of scope (correctly excluded)
Response caching + provider breadth (June 14 competitive doc — backend initiatives, not node). Verification submission-text strategy, NPM_TOKEN→Trusted Publishers, GSC, telemetry, `/n8n-setup` page, forum post. Budget under-counts hosted-tool fees (Open Questions 2026-06-14) — proxy concern; low risk on the Chat Completions path; don't promise pixel-perfect budget accuracy in reframe copy.
