---
name: auto-tinker-learn
description: Turn one experiment's evidence into a tailored tutorial, durable lesson, capability update, and next learning paths. Use after a run to explain what it proved, assess evidence-supported growth, or map prerequisites; use auto-tinker-review for broader status summaries.
---

# Auto-Tinker Learn

Teach from evidence and the user's prior knowledge; do not inflate capability claims.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Workflow

1. Read the experiment, tests, decisions, failures, evidence snapshots, optional repository locations, source references, existing lessons, active main goal, and relevant graph nodes.
2. Explain what the technology is, why it mattered to the goal, how the important parts work, what changed, what failed, and how verification supports the conclusion.
3. Tailor detail to the profile and prior graph. Explicitly distinguish source facts, experiment observations, and inference.
4. Persist the lesson with `auto-tinker lesson create --title <title> --summary <markdown>`, linking `--experiment`, `--capability`, and `--tags`.
5. Append the candid narrative with `auto-tinker journal append --kind private-journal` when the run has a meaningful outcome. Keep `readme`, `changelog`, and `public-story` records distinct and linked.
6. Run `auto-tinker index` and `auto-tinker graph`, then verify the experiment, lesson, capabilities, technologies, and next candidates are linked.
7. Propose multiple next branches when useful; enqueue only those the user accepts.

Read [lesson-and-capabilities.md](references/lesson-and-capabilities.md) for the lesson shape and evidence stages.

## Rules

- Failed and rejected hypotheses are valuable lessons when documented honestly.
- Do not advance a capability from exposure to mastery because code was generated or one test passed.
- Cite exact experiment/test/source record IDs in durable lesson content.
- Preserve lessons and capability nodes when repository locations are missing or unverified; report that limitation instead of dropping the knowledge or inventing a URL.
- Explain whether the result advanced the active main goal, informed a supporting goal, or proved a distraction was not worth continuing.
- Keep publication-oriented storytelling separate from the full private lesson.
- Preserve the user's writing voice only when profile evidence supports it; otherwise draft plainly for review.
- Default narrative is first person and concrete: why I picked it, what interested or annoyed me, attempts/struggles, what I changed, how I verified it, and what I learned. Keep private detail out of public-story output.

Return the lesson path/ID, capability changes with evidence, graph links, unresolved questions, and ranked next learning branches.
