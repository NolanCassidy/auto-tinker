---
name: auto-tinker
description: Orchestrate an explicit multi-domain Auto-Tinker loop across two or more focused workflows. Use only for an end-to-end or full-day loop, a request that combines multiple Auto-Tinker domains, or an ambiguous Auto-Tinker request that needs routing; otherwise use the focused skill directly.
---

# Auto-Tinker

Operate Auto-Tinker as a chat-first system. Keep Markdown under the resolved workspace's `.auto-tinker/` directory canonical; treat the SQLite index as disposable.

Invoke the CLI as `auto-tinker`; when working from an unlinked source checkout, use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Start every request

1. Resolve the workspace with `--workspace`, `AUTO_TINKER_WORKSPACE`, or the CLI's upward search. Do not assume the product repository is the personal workspace.
2. Run `auto-tinker doctor --workspace <path> --json` before a multi-step or mutating workflow. If both CLI forms are unavailable, explain that dependencies must be installed in the Auto-Tinker product repository and stop before fabricating state.
3. Read `auto-tinker goal show --workspace <path> --json`. Keep exactly one active main goal, distinct from interests and optional supporting goals; do not silently choose one.
4. Parse JSON results and carry returned record IDs into later commands. Do not infer IDs from filenames.
5. Route focused work to the matching `$auto-tinker-*` skill when available. Otherwise follow the equivalent CLI sequence in [orchestration.md](references/orchestration.md).

## Route ownership explicitly

- Initialize or diagnose: `$auto-tinker-setup`
- Change goals, interests, limits, or privacy: `$auto-tinker-profile`
- Backfill, capture, reconcile, or deduplicate evidence: `$auto-tinker-history`
- Find and evaluate ideas: `$auto-tinker-discover`
- Star, rank, schedule, block, or select local queue state: `$auto-tinker-queue`
- Plan, build, modify, and verify: `$auto-tinker-run`
- Teach back and update capabilities: `$auto-tinker-learn`
- Perform any GitHub remote mutation or publish reviewed work: `$auto-tinker-publish`
- Summarize progress, review writing, or query the graph: `$auto-tinker-review`
- Configure scheduler policy and task prompts: `$auto-tinker-automate`

Do not retain ownership after routing a focused request. In a multi-domain loop, keep the boundaries: queue changes state, run executes local code, review summarizes, automate configures scheduling, and publish alone mutates GitHub.

## Enforce invariants

- Create experiment repositories locally under the workspace `tinkers/` area, never inside the public product checkout.
- Create remote experiment repositories as private through `$auto-tinker-publish`. Change visibility only when `repository_publication_approval: approved`, an explicit current-chat approval is supplied to the publish workflow, or durable settings explicitly contain `auto_public: true`.
- Never infer `auto_public` from enthusiasm, prior pushes, or a public source repository.
- Preserve attribution, licenses, failures, negative results, command evidence, and test output.
- Preserve useful knowledge even when source code has no known local or GitHub location. Mark locations as missing or unverified; never invent a repository link.
- Keep a clear `What I changed / learned` section at the top of experiment READMEs; append a dated entry when revisiting one.
- Keep four linked artifacts distinct: candid private journal, richer repository README, concise dated changelog, and privacy-reviewed public story draft.
- Explain how recommendations advance the main goal or risk distracting from it.
- Let the viewer edit safe local state and emit copyable prompts only. Never ask it to invoke a skill, model, shell, GitHub, or scheduler.
- Treat README review, public-story review, and repository-publication approval as independent states. Never use writing approval as consent to make a repository public.
- Stop for new authority before destructive cleanup, secret access, public publication, or mutations outside the selected experiment boundary.

Finish by rebuilding the index, reporting exact changed record paths and any verified repository locations, listing tests, and naming any approval still required.
