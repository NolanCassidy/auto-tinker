---
name: auto-tinker-review
description: Summarize evidence-backed Auto-Tinker status and inspect the local graph, main-goal progress, queue health, and writing readiness. Use for daily, weekly, project, or capability reviews and questions about what was done, learned, blocked, scheduled, or connected; this skill does not execute code or mutate GitHub.
---

# Auto-Tinker Review

Review canonical Markdown and exact evidence; do not turn missing repository links into missing knowledge.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Workflow

1. For a daily closeout, run `auto-tinker history reconcile --workspace <path> --json` before summarizing.
2. Run `auto-tinker index`, then `auto-tinker goal show`, `auto-tinker graph`, `auto-tinker queue list`, and `auto-tinker discover` with `--json`.
3. Trace claims to event, evidence snapshot, experiment, test, lesson, journal, changelog, or source record IDs.
4. Classify repository locations as verified local, verified remote, both, missing, or unverified. Preserve and report knowledge nodes that have no repository.
5. Assess each active/finished item against the one active main goal: contribution, distraction cost, success criteria, and exploration budget. Keep supporting goals separate.
6. Separate observed facts from inference and unanswered questions. Do not use activity volume as capability growth.
7. Review an individual writing artifact only on user direction with `auto-tinker journal review <journal-id> --state <pending|approved>`. This changes writing-review state only.
8. Generate the requested next action with `auto-tinker prompt <intent> [--target <id>] [--agent <name>]`; present it as copyable text for a chat agent.

Read [review-cadences.md](references/review-cadences.md) for daily, weekly, and graph-query output contracts.

## Boundaries

- A review is read/reconcile/index work. It does not start coding or publish remotely.
- Report `private-journal`, `readme`, `changelog`, and `public-story` as separate linked artifacts with separate readiness.
- Report `readme_review`, `public_story_review`, and `repository_publication_approval` separately from one another and from actual remote visibility.
- Never treat `journal review`, `writing_approval`, README review, or public-story review as consent to make a repository public.
- Flag stale machine/profile data, weak evidence, unresolved duplicates, broken links, blocked work, main-goal drift, and privacy risks.
- The viewer may display these results and edit safe local review/queue state, but it never invokes this skill itself.

Return exact record paths/IDs, evidence strength, changed reconciliation counts, main-goal progress, next decisions, and copyable prompts.
