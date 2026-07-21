---
name: auto-tinker-automate
description: Configure, inspect, or revise Auto-Tinker scheduler policy and exact task prompts without creating a second state system. Use when changing cadence, daily limits, scheduled-task scope, pause behavior, or scheduler handoffs; this skill configures automation but does not perform the scheduled workload or mutate GitHub.
---

# Auto-Tinker Automate

Schedule the same chat-first skills used manually. Keep durable settings in the local Markdown vault and scheduler state in the host scheduler.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Configure policy first

1. Read `auto-tinker profile show`, `auto-tinker config show`, `auto-tinker goal show`, `auto-tinker doctor`, queue state, and current automation records.
2. Confirm cadence/timezone, experiments per day, concurrency, time/compute budget, active main-goal minimum, exploration budget, allowed directories, network policy, source licenses, cleanup, stop conditions, and notification/review behavior.
3. Save accepted durable execution scope with `auto-tinker config update --automation-mode <mode> --time-budget-minutes <n> --max-concurrency <n>` and save profile/goal changes through their focused commands. Default to `discover-only`. Never infer `auto_public`, a main goal, private-remote authority, or broader paths from a one-time request.
4. Generate an exact task body with `auto-tinker prompt <intent> --agent <name> --workspace <path> --json`.
5. If the current product exposes a scheduling tool and the user asked to schedule, create/update only the scheduler entry there. Otherwise return the prompt for the user to paste into their chosen agent scheduler. Do not run the task body during configuration.
6. Re-read saved profile/goal/automation state and report the next run in the user's timezone.

Read [automation-policy.md](references/automation-policy.md) for modes and prompt contracts.

## Safety rules

- Default `automation_mode` to `discover-only`; enable `execute-local`, `draft-contribution`, or `create-private-remote` only from explicit durable settings.
- Treat `time_budget_minutes` as a hard wall-clock stop. It never expands allowed paths, network access, or publication authority.
- Manual queue rank, block, schedule, and pause always win.
- Keep each experiment in its own returned `tinkers/` path and obey concurrency limits.
- A scheduled task may call `$auto-tinker-publish` for new private remotes only when `automation_mode` is `create-private-remote`. This skill never performs the GitHub mutation itself.
- Public visibility requires `repository_publication_approval: approved`, explicit approval in the executing publish chat, or durable `auto_public: true`. README/public-story review never substitutes for that consent.
- Never place secret values in prompts, Markdown, logs, or scheduler configuration.
- On uncertainty, failed doctor, missing code, failed tests, risky license, or budget exhaustion: preserve evidence, mark blocked/review, notify, and stop.
- The local viewer may show schedules and copyable task text, but must not invoke the scheduler or skills.

Return saved policy, scheduler identity when applicable, exact task text, next run, stop conditions, and how to pause it.
