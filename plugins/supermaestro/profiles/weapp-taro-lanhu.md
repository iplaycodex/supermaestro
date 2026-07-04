# Weapp Taro Lanhu Profile

Use this profile for WYWK Taro 3 mini-program / H5 requirements with Lanhu schema materials.

## UI Source Rules

- `source/ui/manifest.json` plus `source/ui/schemas/*.json` is the UI source of truth.
- Images are optional baselines; missing images do not lower UI accuracy requirements.
- When schema files exist, UI implementation must be schema-first.
- Do not replace image-backed or complex visual nodes with CSS approximations unless the user explicitly accepts the degradation.

## Required UI Artifacts

Before UI coding:

- `specs/ui-material-index.md`
- `specs/ui-schema-extract.md`
- Schema-to-implementation mapping table
- Resource mapping for image-backed nodes

Before Gate 2:

- Visual validation evidence, or explicit `visual-validation-blocked` status.
- Strong visual areas checked block by block.
- Remaining UI risks listed in `reports/validation.md`.

## Taro Constraints

- Read project `AGENTS.md`, `package.json`, app route config, and related page/server files before planning.
- Follow existing Taro 3 / React 17 / Sass patterns.
- For JSX class composition, prefer the project convention (`classnames` as required by the repo rules).
- Platform differences should prefer platform files or existing `process.env.TARO_ENV` patterns.

## API and Mock Rules

- Page-level API functions should live near the page in `server.js` unless the project already has a shared API module for that domain.
- Mock and real API field mapping must be documented in `specs/api-spec.md`.
- Login, phone binding, request concurrency, empty state, and stale response handling are high-risk review points.
