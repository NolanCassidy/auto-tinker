# Orchestration recipes

Use the CLI's `--help` output as the installed-version authority for optional flags. Every state-changing step must invoke the CLI; normal agent tools remain responsible for research, source inspection, coding, and test execution.

## Command conventions

```bash
auto-tinker <command> --workspace /absolute/workspace --json
auto-tinker <group> <command> --workspace /absolute/workspace --json
```

Use the human-readable default for an interactive summary and `--json` when one command feeds another. Preserve the CLI's stdout/stderr as evidence when a step fails.

## Full manual loop

1. `doctor`; initialize with `init` only when no vault exists.
2. Read or update `profile`; read `goal show` and set/switch the main goal only from user direction; then refresh `inspect-machine` when stale.
3. Use `history import`, `history capture`, or `history reconcile` for the requested time window.
4. Use agent web/GitHub tools to collect current source evidence, then run `discover`, `candidate add`, and `candidate evaluate` as appropriate.
5. Show `queue list`; honor manual order; choose with `queue next`; change state with `queue update`.
6. Resolve whether code exists locally, remotely, only in an evidence snapshot, or not at all. Call `experiment create` and `repo plan` before editing; work only in a returned or explicitly approved path.
7. Build or modify with normal coding tools. Record material checkpoints with `experiment update`.
8. Run success-criterion tests. Call `experiment complete` only with exact verification evidence.
9. Call `lesson create`. Use separate `journal append --kind` calls for the private journal, dated changelog, README record when a repository exists, and public-story review draft when requested. Then run `index` and `graph`.
10. If a GitHub mutation is requested, hand off to `$auto-tinker-publish`. That skill alone calls `repo create-private` or `repo publish` after its independent writing, attribution, license, and repository-publication gates pass.

## Safe automation loop

Run only the actions allowed by durable policy. A typical daily loop is `history reconcile` → discovery → `queue next`. Local execution additionally requires an eligible queue item, time/compute budget, sandbox path, and stop conditions. Queue changes state only; run executes local code; review summarizes; automate configures scheduling; publish alone mutates GitHub.

## Failure handling

- If a command returns nonzero, do not hand-edit around a deterministic validation or policy failure.
- If JSON is malformed or the CLI version lacks a needed command, run `auto-tinker --help` and report the mismatch.
- If a coding experiment fails, preserve the failure as evidence and leave it in review/blocked state rather than claiming completion.
- Re-run `index` after repairing canonical Markdown; never treat SQLite as recovery source.
