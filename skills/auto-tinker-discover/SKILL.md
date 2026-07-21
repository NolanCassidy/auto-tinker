---
name: auto-tinker-discover
description: Research current sources and persist evidence-backed Auto-Tinker candidates with trust, compatibility, and experiment scores. Use for trending or topic/language-filtered ideas, career-aligned recommendations, URL evaluation, or source-catalog growth; this skill does not change queue order or execute code.
---

# Auto-Tinker Discover

Find high-value experiments, not a feed of popular links.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Workflow

1. Read `auto-tinker profile show`, `auto-tinker config show`, `auto-tinker goal show`, `auto-tinker inspect-machine`, `auto-tinker source list`, `auto-tinker discover`, and recent graph/queue state with `--workspace <path> --json`.
2. Convert the request into explicit filters: topics, languages, main and supporting goals, license, time, difficulty, activity mode, machine requirements, and exploration budget.
3. Reuse enabled catalog records and their weights/techniques. Add or update durable sources with `auto-tinker source add|update`, including kind, credential-free web URL or `local://<safe-alias>`, topics, languages, cadence, weight, query techniques, trust notes, and retrieval date. Keep query hints deterministic and source-specific; never store a local absolute path.
4. Search fresh sources with available web/GitHub tools. Use primary repository, release, package-registry, paper, or vendor sources for technical claims; record retrieval dates.
5. Inspect license, provenance, recent maintenance, docs/tests, issue quality, local requirements, supply-chain risk, and duplication before recommending a candidate.
6. Design one bounded, meaningful experiment for each viable candidate. Prefer a coherent from-scratch implementation when adaptation would be trivial; prefer an attributed adaptation when the source itself is what the user should learn.
7. Persist each result with `auto-tinker candidate add`, including `--goal-contribution` and `--distraction-risk`; then score it with `auto-tinker candidate evaluate <id>` using the same explicit reasoning. Use returned IDs; do not infer them.
8. Show several diverse candidates with reasons, evidence, risks, estimated effort, and the precise proposed change. Do not clone or start work in this skill.

Read [source-and-scoring.md](references/source-and-scoring.md) before broad discovery or evaluating unfamiliar code.

## Quality bar

- Match the current user, machine, and learning graph—not popularity alone.
- Treat source weight as one transparent ranking input, never a substitute for current evidence or main-goal fit.
- Check that the work can demonstrate a real capability through tests or a working artifact.
- Reject shallow README-only churn, artificial commit farming, copied tutorials with no extension, license conflicts, and unsafe execution.
- Reserve some results for adjacent surprise while explaining why each is plausible.
- Never imply that a source is “trending” without current dated evidence.
- Keep candidate state private. Public source material does not make the user's future work public.
- Explain whether each idea advances the active main goal, serves only a supporting interest, or consumes the configured exploration budget as a deliberate distraction.

Return candidate IDs and a copyable prompt for starring, reordering, or starting them.
