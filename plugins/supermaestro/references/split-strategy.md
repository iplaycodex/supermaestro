# Split Strategy

Prefer splitting by reviewable behavior, not by file type.

Good split examples:

- Foundation: API/server/mock/route contracts.
- Feature: one page or one user workflow.
- UI: one final board group or repeated component family.
- Review: one independent diff or patch.

Avoid:

- One huge foundation that changes API, routes, UI, and page behavior together.
- Feature tasks that silently modify shared contracts.
- Review packs that require the reviewer to compare unrelated pages at once.
