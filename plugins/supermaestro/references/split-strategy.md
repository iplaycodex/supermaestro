# Split Strategy

Prefer splitting by reviewable behavior, not by file type.

Mission Control owns orchestration and execution discipline:

- Write task cards at an executable granularity: files, steps, tests, commands, and expected results.
- Mark each coding task with a TDD decision: `required`, `not-applicable`, or `deferred`.
- Require TDD for behavior code such as API/server/mock contracts, hooks, stores, data transforms, state machines, route params, permission/error branches, analytics params, and business calculations.
- Do not force TDD onto pure visual reconstruction, asset moves, static copy, registration-only config, or generated code; record the skip reason instead.
- Treat UI pages as mixed tasks: visual fidelity uses schema/visual validation, while interaction state and data behavior still use TDD.

Good split examples:

- Foundation: API/server/mock/route contracts.
- Feature: one page or one user workflow.
- UI: one final board group or repeated component family.
- Review: one independent diff or patch.
- TDD unit: one observable behavior with RED/GREEN evidence.

Avoid:

- One huge foundation that changes API, routes, UI, and page behavior together.
- Feature tasks that silently modify shared contracts.
- Review packs that require the reviewer to compare unrelated pages at once.
