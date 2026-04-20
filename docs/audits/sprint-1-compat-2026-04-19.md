# Sprint 1.2 — `@n8n/node-cli` compat gate

**Date:** 2026-04-20
**CLI version:** `@n8n/node-cli@0.23.1`
**Local Node:** `v25.8.1` (satisfies `n8n@2.16.1` `engines.node >=22.16`)

## Results

### `npx n8n-node build` — PASS

```
┌   n8n-node build  v0.23.1
◇  TypeScript build successful
◇  Copied static files
└  ✓ Build successful
```

Output verified under `dist/`:

- `dist/nodes/TokenSenseAi/TokenSenseAi.node.{js,d.ts,js.map}`
- `dist/nodes/TokenSenseChatModel/TokenSenseChatModel.node.{js,d.ts,js.map}`
- `dist/nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.{js,d.ts,js.map}` (will be
  relocated to `future/` in Sprint 2.1)
- `dist/credentials/TokenSenseApi.credentials.{js,d.ts,js.map}`
- `dist/icons/tokensense.svg` (auto-copied by scaffold — `postbuild cp -r icons dist/icons`
  script can be dropped)

The scaffold's TypeScript compile picks up the repo's existing `tsconfig.json` and
the current `credentials/`, `nodes/`, `shared/` layout without any changes. Static
asset copy (icons) is handled by the scaffold — no separate `postbuild` step needed.

### `npx n8n-node lint` — Crashes only due to missing config

```
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

This is the expected ESLint 9 flat-config requirement, not a layout incompatibility.
Once `eslint.config.mjs` lands in Sprint 1.4, the scaffold lint runs; dry-run lint
violations are inventoried in Sprint 1.8.

## Decision: Path A

Adopt `@n8n/node-cli` for build, dev, lint, and release. Current repo layout is
already compatible — no file moves required. Rationale:

- Same tool n8n-io uses for community nodes; reduces maintenance divergence over
  time.
- Handles icon copy automatically; we can remove the `postbuild cp -r icons`
  script.
- Lint crash is config-missing, not layout-incompatibility — once `eslint.config.mjs`
  is in place (Sprint 1.4), `n8n-node lint` runs normally.

## Scripts (Sprint 1.3, Path A)

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

`postbuild` icon-copy removed — scaffold copies static files during build.

## Sprint 1.8 — Dry-run lint inventory (post-`eslint.config.mjs`)

`npm run lint` ran against the current source and produced **37 errors + 1 warning**.
Grouped by how Sprint 2 clears each class:

### Cleared by Sprint 2.1 (relocate embeddings to `future/`)
All violations in `nodes/TokenSenseEmbeddings/TokenSenseEmbeddings.node.ts`
including the `globalThis` restricted-globals errors (2).

### Cleared by Sprint 2.4 (ChatModel rewrite to `supplyModel`)
- `TokenSenseChatModel.node.ts:9` `no-restricted-imports (@langchain/openai)`

### Cleared by Sprint 2.5 (`httpRequestWithAuthentication`)
- `TokenSenseAi.node.ts:502,542,576,630,667,706,756,785` `no-http-request-with-manual-auth` (8 ops)
- `shared/utils.ts:68` `no-http-request-with-manual-auth` (`loadModels`)

### Cleared by Sprint 2.6 (`form-data` removal)
- `TokenSenseAi.node.ts:9` `no-restricted-imports (form-data)`

### Cleared by Sprint 2.2 (credential `authenticate` block) + manual fix
- `TokenSenseApi.credentials.ts:3` `icon-validation`,
  `cred-class-field-icon-missing` — add an `icon = 'file:../icons/tokensense.svg'`
  (or equivalent) while rewriting the credential
- `TokenSenseApi.credentials.ts:6`
  `cred-class-field-documentation-url-miscased` — autofixable (property name
  casing)

### Fixed by `--fix` during Sprint 2 (autofixable n8n-nodes-base)
`TokenSenseAi.node.ts` and `TokenSenseChatModel.node.ts`:

- `node-param-options-type-unsorted-items` (alphabetize options)
- `node-param-display-name-wrong-for-dynamic-options`
  (rename `Model` → `Model Name or ID`)
- `node-param-description-missing-from-dynamic-options`
  (add the "Choose from the list…" copy)
- `node-param-display-name-miscased` (title-case display names)
- `node-class-description-inputs-wrong-regular-node` / `outputs-wrong`
  (`['main']` string literal form) — applies to the two regular nodes and the
  embeddings class (embeddings moves to `future/`, so only Chat Model remains —
  note that ChatModel declares `outputs: ['ai_languageModel']` which is
  intentional for sub-nodes, so we will suppress this via disable-next-line if
  `--fix` tries to normalize it)

### Manual fix in Sprint 2.4/2.5 (not autofixable)
- `TokenSenseAi.node.ts:12` `node-usable-as-tool` — add
  `usableAsTool: true` to the node description
- `TokenSenseAi.node.ts:33`
  `resource-operation-pattern` (warning only; 8 ops without resources) —
  deferred to v0.2.0 (grouping would be a breaking UX change for existing users)

### Acceptance at end of Sprint 1
- `npm run lint` runs without crashing ✓
- `npm run build` produces `dist/` cleanly ✓
- `npm test` will be verified after Sprint 1 commit (does not discover files
  under `future/` — `future/` does not yet exist at the end of Sprint 1)
- CI workflow updated to Node 22 ✓

All remaining lint errors are scheduled to clear in Sprint 2 per the mapping
above.

