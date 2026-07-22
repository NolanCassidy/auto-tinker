---
name: auto-tinker-run
description: Execute a bounded local Auto-Tinker coding experiment by planning it, creating or resuming its local scratch or adaptation checkout, making a meaningful change, verifying it, and recording evidence. Use when starting, resuming, modifying, testing, or completing an experiment; use auto-tinker-publish for every GitHub mutation.
---

# Auto-Tinker Run

Produce a working, teachable experiment—not activity for its own sake.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Plan before editing

1. Read `auto-tinker goal show`; explain how the selected work advances the active main goal or why its distraction cost is acceptable.
2. Confirm the selected candidate/goal, mode (`scratch` or `adapt`), time budget, allowed paths/network, stop conditions, and success tests.
3. Resolve code location: verified local path, verified remote URL/revision, evidence snapshot only, missing, or unverified. Never invent a local path or GitHub repository.
4. For adaptations, inspect the exact upstream revision, license, trust, setup, and attribution requirements before execution. If source code is unavailable, explain what is missing or offer a separately scoped scratch experiment.
5. Choose a concise, project-specific `--repo-name` that follows explicit profile constraints and describes the artifact, not the workspace. Do not add generic `tinker-`, `auto-tinker-`, `experiment-`, username, or date prefixes. For an adaptation, name the user's delta clearly enough to avoid confusion with upstream. Run `auto-tinker experiment create --title <title> --goal <goal> --mode <mode> --repo-name <name>` with only verified candidate/source/repo/tags options and any truthful repeatable `--location <json>` values.
6. Run `auto-tinker repo plan <experiment-id> --workspace <path> --json` and review the planned local/remote identity. Planning does not create or publish a remote. Do not edit until the exact workspace `tinkers/` path is returned and approved.

## Build and verify

1. Establish a reproducible baseline before changes.
2. Use normal coding tools to implement the smallest meaningful slice. Do not modify the public Auto-Tinker product checkout unless that product itself is the explicitly selected experiment.
3. Record material checkpoints with `auto-tinker experiment update <id>` using status, summary, repeatable location JSON, and exact `--evidence <json>` snapshots.
4. Run the agreed tests plus relevant lint/type/build/security checks. Compare against the baseline and capture failures or negative findings.
5. Call `auto-tinker experiment complete <id> --summary <markdown> --test <evidence>` only when success criteria pass. Otherwise leave `review` or `blocked` with an honest summary.
6. Create separate linked records with `auto-tinker journal append --kind private-journal` and `--kind changelog`. Update `--kind readme` only when a verified repository exists; keep any `--kind public-story` artifact pending review. Writing review is handled with `auto-tinker journal review <journal-id> --state <pending|approved>`, not repository-publication approval.
7. Hand off to `$auto-tinker-learn`, then `$auto-tinker-publish` only if remote work was requested.

Read [execution-playbook.md](references/execution-playbook.md) before running third-party code or resuming an experiment.

## Non-negotiable boundaries

- Do not expose secrets to untrusted builds or persist secrets in evidence.
- Do not use destructive commands outside an exact disposable target.
- Preserve upstream attribution and license notices.
- Do not create a GitHub repository, add/push a remote, or change remote visibility. Hand every such mutation to `$auto-tinker-publish`.
- Prefer a from-scratch build inspired by sources when the entire adaptation would be one-shot cosmetic churn.
- A completed experiment requires test evidence, a clear change/learning narrative, and reproducible next steps.
- Evidence JSON accepts only `test`, `build`, `commit`, `file`, `screenshot`, `note`, or `other`. Record source inspection as `note` or `file`; do not invent a `source-inspection` kind.
