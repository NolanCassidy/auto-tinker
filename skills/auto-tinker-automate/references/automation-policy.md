# Automation policy

## Scheduler task modes

`$auto-tinker-automate` only records policy and configures the scheduler entry. The future scheduled task invokes the focused skills named below; configuring it does not execute any mode.

1. **`discover-only` (default):** reconcile optional history, refresh sources/candidates, and update the queue.
2. **`prepare-only`:** select and inspect an item; create an experiment plan but do not modify code.
3. **`execute-local`:** make bounded changes and verify inside an approved tinker path.
4. **`draft-contribution`:** prepare local commits and separate README, changelog, private-journal, and public-story records.
5. **`create-private-remote`:** the task must invoke `$auto-tinker-publish`; private external mutation is allowed only by this explicit durable mode.

Public publication is intentionally not an automation mode. It remains a separate `$auto-tinker-publish` decision requiring `repository_publication_approval: approved`, explicit approval in that executing chat, or durable `auto_public: true`; README or public-story review is not consent.

Save and verify the durable scope before creating a scheduler entry:

```bash
auto-tinker config update --workspace /absolute/workspace --json \
  --automation-mode execute-local \
  --time-budget-minutes 60 \
  --max-concurrency 1
auto-tinker config show --workspace /absolute/workspace --json
```

The time budget is a positive integer from 1 to 1440 minutes and is a hard stop, not an estimate.

## Required task-body content

- invoke the exact `$auto-tinker-*` skill(s)
- absolute workspace path, timezone, and intended date window
- active main goal, minimum goal contribution, and exploration budget
- mode, maximum experiment count, concurrency, and wall-clock/compute budget
- allowed mutation roots and network policy
- queue precedence and eligibility rules
- required verification and evidence capture
- private-by-default repository policy; separate README, public-story, attribution, license, and repository-publication gates
- failure/notification/stop behavior
- instruction to run `history reconcile`, `index`, and review at closeout

Generate a starting task body with:

```bash
auto-tinker prompt daily --workspace /absolute/workspace --json --agent codex
```

Inspect `auto-tinker prompt --help` for available intent names in the installed version.

## Recommended daily order

`history reconcile` → discovery → queue next → optional bounded runs → lessons/writing artifacts → index → review.

Run selected experiments sequentially unless concurrency is explicitly greater than one and their repositories, ports, compute, and mutation boundaries do not overlap. Never treat an empty eligible queue as permission to invent unrestricted work.

End configuration after saving and verifying the scheduler entry. Do not run the generated task body as part of this skill.
