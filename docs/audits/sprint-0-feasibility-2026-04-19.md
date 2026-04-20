# Sprint 0 — Feasibility Audit

> **Date:** 2026-04-19
> **Branch:** `claude/npm-publish-v0.1.0`
> **Plan:** `docs/plans/npm-publish-final-2026-04-19-v6.md`
> **Docker:** Installed (v29.2.1) but daemon not running — used npm-install fallback for 0.3/0.5

---

## 0.1 (GATE) Bearer auth against production proxy

**Status: BLOCKED**

`TS_TEST_KEY` env var is not set. Cannot execute curl against `https://api.tokensense.io/v1/chat/completions`.

**Action required:** Carlo must provide the TokenSense API key as `TS_TEST_KEY` to unblock this gate.

---

## 0.2 (GATE) Body-level `metadata` reaches TokenSense logs

**Status: BLOCKED**

Depends on `TS_TEST_KEY` (same as 0.1). Even after the curl succeeds, Carlo must manually verify the log row appears in the TokenSense Dashboard before this gate can pass.

**Action required:** Same as 0.1 — provide key, then manually verify Dashboard log row.

---

## 0.3 (GATE) Clean n8n runtime resolves `@n8n/ai-node-sdk`

**Status: PASS (with plan corrections needed)**

**Method:** npm-install fallback (`/tmp/n8n-gate`)

### Actual output

```
N8N_VERSION        2.16.1
N8N_ENGINES_NODE   {"node":">=22.16"}
SDK_VERSION        0.7.0
HAS_supplyModel    function
```

### Plan vs. reality

| Field | Plan assumed | Actual | Impact |
|-------|-------------|--------|--------|
| n8n version | "current" (2.x) | **2.16.1** | None — correct major |
| SDK version | 0.8.0 | **0.7.0** | Peer range in plan must change from `>=0.8.0 <0.9.0` to `>=0.7.0 <0.8.0` |
| SDK on npm registry | 0.8.0 | **0.4.1** | n8n bundles SDK internally at 0.7.0; npm registry lags at 0.4.1. devDependencies pin must use the bundled version. |
| engines.node | `">=20.19 <=24.x"` | **`">=22.16"`** | Plan's `">=20.19 <25"` is too permissive. Should align to `">=22.16"` |
| supplyModel | function | **function** | Confirmed ✓ |

### SDK availability (resolved)

npm dist-tags for `@n8n/ai-node-sdk`:
- `latest` → **0.4.1**
- `beta` → **0.8.0**
- All versions on npm: 0.1.0, 0.2.0, 0.3.0, 0.4.0, 0.4.1, 0.5.0, 0.5.1, 0.6.0, **0.7.0**, **0.8.0**

`@n8n/ai-node-sdk@0.7.0` IS available on npm (just not tagged `latest`). Verified:
- `npm install @n8n/ai-node-sdk@0.7.0` succeeds
- Exports include `supplyModel` (type: function)
- Same export surface as the version bundled in n8n@2.16.1

**devDependencies strategy:** Use `"@n8n/ai-node-sdk": "0.7.0"` (exact pin matching what n8n@latest ships).
**peerDependencies strategy:** `">=0.7.0 <0.9.0"` — covers 0.7.0 (shipped by n8n@2.16.1) and 0.8.0 (beta, likely next n8n release). Both have `supplyModel`.

---

## 0.4 Record peer-range floor/ceiling

**Status: RECORDED (with corrections)**

Based on 0.3 findings:

| Field | Plan v6 value | Corrected value | Notes |
|-------|--------------|-----------------|-------|
| `peerDependencies.@n8n/ai-node-sdk` | `">=0.8.0 <0.9.0"` | **`">=0.7.0 <0.9.0"`** | Covers 0.7.0 (n8n@2.16.1) and 0.8.0 (beta). Both on npm, both have `supplyModel`. |
| `devDependencies.@n8n/ai-node-sdk` | `"0.8.0"` | **`"0.7.0"`** | Exact pin matching n8n@latest. Installable from npm. |
| `peerDependencies.n8n-workflow` | `">=2.13.0 <3.0.0"` | **Confirmed correct** | n8n 2.16.1 ships n8n-workflow 2.16.0 |
| `engines.node` (our package) | `">=20.19 <25"` | **`">=22.16"`** | Must match n8n's own requirement |

---

## 0.5 (GATE) Confirm `additionalParams` → HTTP body mapping

**Status: PASS**

### Actual output

```
additionalParams found: true
Line 45: modelKwargs: model.additionalParams,
```

**Source file:** `node_modules/@n8n/ai-utilities@0.10.0/dist/esm/suppliers/supplyModel.js`

`additionalParams` is mapped to `modelKwargs` in the OpenAI model supplier. This confirms that setting `additionalParams.metadata` on the model config will pass `metadata` through to the upstream API body — the core mechanism TokenSense Chat Model depends on.

---

## 0.6 (GATE) Node-version compatibility for CI

**Status: PASS**

### Decision

n8n@2.16.1 declares `engines.node: ">=22.16"`.

Per the plan's decision table:
- `engines.node` includes `22` → **CI should use Node 22**

Specifically, n8n requires **22.16 or higher** — Node 20 is explicitly excluded. This is more restrictive than the plan anticipated.

**CI matrix:** `node-version: '22'` (confirmed, not a fallback)

**Our `engines.node`:** Should be `">=22.16"` to match n8n's requirement (plan's `">=20.19 <25"` is too permissive and would let users install on Node 20 where n8n itself won't run).

---

## Summary

| Gate | Status | Blocker? |
|------|--------|----------|
| 0.1 | BLOCKED | Yes — need `TS_TEST_KEY` |
| 0.2 | BLOCKED | Yes — need `TS_TEST_KEY` + manual Dashboard check |
| 0.3 | PASS (with corrections) | No — but plan's SDK version assumptions need updating |
| 0.4 | RECORDED | No — peer range TBD pending SDK availability research |
| 0.5 | PASS | No |
| 0.6 | PASS | No |

### Plan corrections required before Sprint 1

1. **SDK version:** Plan says 0.8.0 — n8n@latest ships **0.7.0**. Both 0.7.0 and 0.8.0 are on npm (0.8.0 tagged `beta`). Use `devDependencies: "0.7.0"`, `peerDependencies: ">=0.7.0 <0.9.0"`.
2. **engines.node:** Plan says `">=20.19 <25"` — n8n requires **`">=22.16"`**. Our package should use `">=22.16"` to match.
3. **Node.js runtime:** Local Node is v25.8.1 which satisfies `>=22.16`. CI should pin Node 22 (LTS).
4. **n8n-workflow:** Version 2.16.0 ships with n8n@2.16.1. Plan's `">=2.13.0 <3.0.0"` peer range is correct.
