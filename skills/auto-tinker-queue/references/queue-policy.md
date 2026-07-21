# Queue policy

## Lifecycle

Use these states where supported:

`inbox -> candidate -> queued -> ready -> running -> review -> learned -> shipped`

Side exits are `blocked`, `skipped`, and `archived`. Use `blocked-reason` for a real dependency or risk, not as a generic note.

## Update examples

```bash
auto-tinker queue update <id> --workspace /absolute/workspace --json --starred true --rank 1
auto-tinker queue update <id> --workspace /absolute/workspace --json --scheduled-for 2026-07-22T09:00:00-07:00
auto-tinker queue update <id> --workspace /absolute/workspace --json --blocked-reason "Needs Docker" --status blocked
auto-tinker queue update <id> --workspace /absolute/workspace --json \
  --goal "Learn durable workflow recovery" \
  --goal-contribution "Produces the main goal's recovery evidence." \
  --distraction-risk "Low; fits the current milestone." \
  --status ready
auto-tinker queue next --workspace /absolute/workspace --json --count 2
```

Use ISO-8601 timestamps with an explicit offset. Confirm ambiguous relative dates in the user's timezone.

## Precedence

1. hard safety, license, machine, and dependency eligibility;
2. explicit block/skip/archive;
3. manual rank and schedule;
4. starred/pinned intent;
5. active main-goal contribution, distraction risk, and learning-path fit;
6. discovery score, novelty, and variety.

## Batch selection

Select `--count <n>` and return separate copyable `$auto-tinker-run` prompts in final queue order. Stop without planning or executing. The run skill decides later whether durable settings and repository, port, compute, and mutation boundaries allow concurrency.
