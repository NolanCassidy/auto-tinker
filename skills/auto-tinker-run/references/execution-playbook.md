# Execution playbook

## Create a scratch experiment

```bash
auto-tinker experiment create --workspace /absolute/workspace --json \
  --title "Durable local workflow demo" \
  --goal "Learn replay-safe job orchestration" \
  --mode scratch \
  --repo-name "durable-workflow-tinker" \
  --tags "typescript,workflow,local-first"
```

## Create an attributed adaptation

```bash
auto-tinker experiment create --workspace /absolute/workspace --json \
  --title "Offline graph adaptation" \
  --goal "Add a verified local-only graph mode" \
  --mode adapt \
  --candidate <candidate-id> \
  --source-repo "https://github.com/upstream/project" \
  --location '{"kind":"github","availability":"present","uri":"https://github.com/upstream/project","revision":"<pinned-sha>"}' \
  --repo-name "offline-graph-adaptation"
```

Record exact upstream URL and revision in the experiment and repository README. Do not imply upstream authorship.

```bash
auto-tinker experiment update <id> --workspace /absolute/workspace --json \
  --attribution "Adapted from <project> at <url>@<revision> under <license>; delta: <change>." \
  --license-review compatible
```

Use `--attribution` for a factual attribution statement, not an approval label. Use `--license-review incompatible` and stop when the intended distribution conflicts with the source license.

## Checkpoints

```bash
auto-tinker experiment update <id> --workspace /absolute/workspace --json \
  --status running \
  --location '{"kind":"local","availability":"present","path":"/absolute/workspace/tinkers/example","last_seen":"2026-07-21T12:00:00-07:00"}' \
  --summary "Baseline passes; implementing bounded feature." \
  --test "npm test: baseline 18 passed" \
  --evidence '{"kind":"test","summary":"Baseline: 18 passed","source_ref":"local test output"}'

auto-tinker experiment complete <id> --workspace /absolute/workspace --json \
  --summary "Implemented the feature and documented the key tradeoff." \
  --test "npm test: 22 passed" \
  --test "npm run build: passed" \
  --evidence '{"kind":"test","summary":"Final suite: 22 passed","source_ref":"local test output"}'
```

## Resume safely

First resolve the experiment's current code-location state. If the local path moved, locate it from evidence and verify identity before updating state. If only a remote exists, clone into the approved `tinkers/` path at the recorded revision. If neither exists, preserve the knowledge node and explain that code work cannot resume until code is supplied or a new scratch experiment is authorized.

When code exists, read repository status, README journal, last tests, and unresolved decisions. Append rather than overwrite prior evidence. Establish a current baseline, implement one new improvement, and create a dated journal entry. Daily reconciliation should later deduplicate the resume event.

## Meaningful-change test

The result should demonstrate at least one of: new working behavior, an upstream-quality bug fix, a measured performance/reliability improvement, a useful integration, a reproducible research result, or a from-scratch concept implementation. Cosmetic rebranding, README-only authorship claims, dependency bumps with no reason, and unverified generated code do not qualify.

## Writing outputs

Use four separate `journal append --kind` records. The README describes code and reproduction; the private journal preserves candid context; the changelog is a compact date-indexed outcome; the public story is a separately privacy-reviewed draft. Do not collapse them into one sanitized blob.
