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

Before Review Gate:

- 视觉验证已通过显式 `--visual true` 启用；`strict + UI` 不会自动启用。
- 每个必测画板/页面状态都有单独一条 `test.visual` evidence；blocked visual 也只能覆盖一个 case，并带 `--accepted-skip true --confirmed-by user --confirmation "<用户确认>"`。
- Strong visual areas checked block by block.
- Remaining UI risks listed in `reports/validation.md`.

使用结构化视觉回归时，在 contract 顶层声明 `sourceRoot`，用 `source-revision` 命令计算 `git-working-tree:<sha256>` 后写入 `sourceRevision`，并逐个声明画板/页面状态和 `purpose`。`verify` 会排除 workbench、现场重算 tracked + non-ignored untracked 源码指纹；源码变化即使视觉产物未变也会使 evidence 失效。非 blocked evidence 的 `expected` 必须指向 contract baseline 且 hash 匹配 `baselineHash`。固定 fixture 或 mock 只证明相应数据模式，不等同于 UAT 或真实业务链路。

## Taro Constraints

- Read project `AGENTS.md`, `package.json`, app route config, and related page/server files before planning.
- Follow existing Taro 3 / React 17 / Sass patterns.
- For JSX class composition, prefer the project convention (`classnames` as required by the repo rules).
- Platform differences should prefer platform files or existing `process.env.TARO_ENV` patterns.

## API and Mock Rules

- Page-level API functions should live near the page in `server.js` unless the project already has a shared API module for that domain.
- Mock and real API field mapping must be documented in `specs/api-spec.md`.
- Login, phone binding, request concurrency, empty state, and stale response handling are high-risk review points.
