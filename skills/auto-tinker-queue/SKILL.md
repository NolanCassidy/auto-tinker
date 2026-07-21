---
name: auto-tinker-queue
description: Change local Auto-Tinker candidate and queue state by listing, starring, ranking, scheduling, grouping, blocking, deferring, skipping, or selecting items. Use for ordering or picking work only; this skill does not execute experiments.
---

# Auto-Tinker Queue

Keep the human in control of what runs and why.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Workflow

1. Run `auto-tinker goal show` and `auto-tinker queue list --workspace <path> --json`; preserve returned goal/candidate/queue IDs.
2. Translate conversational changes into explicit `auto-tinker queue update <id>` calls using `--starred`, `--priority`, `--rank`, `--scheduled-for`, `--blocked-reason`, `--goal`, `--goal-contribution`, `--distraction-risk`, or `--status`.
3. Read the queue again and verify exact resulting order/state.
4. For selection, run `auto-tinker queue next --count <n> --workspace <path> --json`. Never substitute the highest discovery score for this command's policy-aware result.
5. Present selected scope, time, prerequisites, machine fit, privacy, main-goal contribution, distraction risk, and a copyable `$auto-tinker-run` prompt. Stop without executing it.

Read [queue-policy.md](references/queue-policy.md) for states, precedence, and batch selection.

## Rules

- Manual rank, pin/star intent, block, and explicit schedule beat automated scores.
- Never silently rewrite the user's goal to improve ranking.
- Keep exactly one active main goal. A manually selected distraction is allowed, but label its tradeoff instead of pretending it advances the goal.
- Do not select blocked, skipped, archived, duplicate, incompatible, or unreviewed-risk candidates.
- A queue selection changes local state only. It does not authorize planning, code execution, GitHub mutation, or unrelated filesystem changes.
- Starting multiple items does not override configured concurrency or resource limits.
- Keep an actionable `goal` and next action on ready work; send unclear items back for refinement.

Return the final ordered list, changes made, selected IDs, exclusions with reasons, and a copyable run prompt.
