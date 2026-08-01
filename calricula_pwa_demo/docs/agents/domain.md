# Domain Docs

How the engineering skills should consume this demo's domain documentation when exploring
the codebase. Paths are relative to `calricula_pwa_demo/`, which is the working root for
these skills.

## Before exploring, read these

- **`CONTEXT.md`** at the demo root — the glossary and domain overview.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't
suggest creating them upfront. The `/domain-modeling` skill (reached via
`/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or
decisions actually get resolved.

## File structure

Single-context repo:

```
calricula_pwa_demo/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-local-first-indexeddb-repository.md
│   │   └── 0002-free-only-openrouter-routing.md
│   └── agents/
└── src/
```

## Existing domain sources

Before writing a new ADR, check whether the decision is already recorded. This demo
already carries a lot of design rationale in prose:

- `CLAUDE.md` — architecture and enforced constraints
- `AGENTS.md` — release, security, and privacy invariants
- `README.md` — the guarded Cloudflare release procedure
- `HANDOFF.md` — point-in-time release status

An ADR should capture a decision and its alternatives, not restate what those files
already document. Link to them instead.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a
hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms
the glossary explicitly avoids.

This domain has established California community-college vocabulary — Course Outline of
Record (COR), Title 5, PCAH, TOP code, CB code, SLO, CCN, articulation. Match the codebase
and the regulations, not a generic synonym.

If the concept you need isn't in the glossary yet, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently
overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## Release-input boundary

`docs/` is **not** a release input. `scripts/release-inputs.mjs` allowlists specific root
files plus `e2e/`, `public/`, `scripts/`, `src/`, and `worker/`; nothing under `docs/`
reaches the static export, the service-worker precache, or the Cloudflare upload. Adding
docs here is safe — but they must still be committed, because the release gate requires a
clean tree.
