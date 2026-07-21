# Profile contract

## Preference groups

- **Identity and voice:** display name and user-approved writing samples or tone notes; never fabricate a personal voice or silently promote private text into a reusable sample.
- **Interests:** topics, languages, frameworks, activity modes, and adjacent exploration areas.
- **Goals:** keep one authoritative active main goal under `goals/main.md`, plus optional supporting goals. Include concrete outcome, success criteria, horizon, constraints, target roles/companies/topics, priority, and exploration budget.
- **Constraints:** operating systems, licenses, risk tolerance, time, disk, memory, GPU, network, and allowed directories.
- **Feedback:** starred, skipped, too easy, too hard, boring, exciting, and explicit negative preferences.
- **Automation:** experiment count, concurrency, schedule intent, time/compute budget, network policy, cleanup, and allowed modes.
- **Publication:** default private, independent README/public-story/attribution/license review requirements, `repository_publication_approval`, and durable `auto_public`.

## Recommendation policy

Derive suggestions from exact history, completed experiments, repeated technologies, or explicit goals. For every suggestion show:

1. proposed field/value;
2. supporting source references;
3. confidence;
4. likely ranking effect;
5. whether accepting it changes execution or publication authority.

Do not turn one accidental technology use into a durable interest. Do not treat completion as enjoyment. Preserve contradictory signals and ask for resolution only when it affects current work. Do not infer the active main goal from frequently used technologies.

## Goal commands

```bash
auto-tinker goal show --workspace /absolute/workspace --json
auto-tinker goal set --workspace /absolute/workspace --json \
  --title "Build a robust trading algorithm" \
  --outcome "Produce an evidence-backed strategy that survives defined robustness gates." \
  --success-criterion "Pass out-of-sample validation" \
  --success-criterion "Document rejected candidates" \
  --horizon "90 days" \
  --exploration-budget 20
auto-tinker goal add --workspace /absolute/workspace --json \
  --title "Learn durable TypeScript workflows" \
  --outcome "Apply and validate recovery patterns in two experiments."
auto-tinker goal switch <goal-id> --workspace /absolute/workspace --json
```

Show the exact main-goal replacement before `goal set` or `goal switch`. Examples are illustrative, not defaults.

## Safe workspace defaults

```bash
auto-tinker config show --workspace /absolute/workspace --json
auto-tinker config update --workspace /absolute/workspace --json \
  --preferred-agent codex \
  --max-concurrency 2 \
  --automation-mode discover-only \
  --time-budget-minutes 60 \
  --discovery-sources "source-catalog-0123456789abcdef,github-trending"
```

Agent IDs are lowercase safe identifiers. Concurrency is an integer from 1 to 16. Automation mode is one of `discover-only`, `prepare-only`, `execute-local`, `draft-contribution`, or `create-private-remote`; the time budget is 1 to 1440 minutes. Discovery defaults contain source-record IDs or built-in aliases, not URLs or credentials. These settings influence copied prompts and future agent/scheduler choices; the viewer still does not execute work.

## Default writing voice

When no approved example exists, use direct first person and cover: why I picked it, what interested or annoyed me, attempts and struggles, what I changed, how I verified it, and what I learned. Avoid generic AI hype, inflated expertise, and claims that are not supported by evidence. Public output removes private details; the private journal remains candid.

## Example conversational operations

- “Add Rust and local inference, but avoid projects requiring an NVIDIA GPU.”
- “I want two 45-minute experiments per day, never concurrently.”
- “Recommend interests my last month of work suggests, but do not save them yet.”
- “Make this one repository public” is a one-time publication request, not `auto_public: true`.
