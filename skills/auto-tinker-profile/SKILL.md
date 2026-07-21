---
name: auto-tinker-profile
description: Read or update durable local Auto-Tinker goals, interests, target roles, technologies, constraints, feedback, writing voice, privacy defaults, and automation limits. Use when changing personal preferences or the one active main goal; this skill does not reorder, execute, or publish work.
---

# Auto-Tinker Profile

Maintain transparent durable preferences and goals; never silently choose a main goal or publication policy.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Workflow

1. Read current state with `auto-tinker profile show --workspace <path> --json`, `auto-tinker config show --workspace <path> --json`, and `auto-tinker goal show --workspace <path> --json`.
2. Separate the user's explicit changes from evidence-based suggestions. Ask only questions whose answers materially affect the requested workflow.
3. Preview the proposed diff, including ranking effects and automation consequences.
4. Apply accepted preference fields with `auto-tinker profile update` and the relevant `--name`, `--tone`, `--interests`, `--constraints`, `--languages`, `--experiments-per-day`, `--preferred-agent`, `--max-concurrency`, `--discovery-sources`, `--auto-public`, or `--body` options. `config update` exposes the three safe agent/concurrency/source defaults directly. Treat legacy `--goals` text as non-authoritative profile context.
5. Manage durable goals through `auto-tinker goal set`, `goal add`, and `goal switch`. Maintain exactly one active main goal in `goals/main.md`; supporting goals may be multiple.
6. Read the profile and goals again and report the durable result.
7. Re-evaluate queued candidates when the main goal or constraints change.

Use [profile-contract.md](references/profile-contract.md) for field semantics and recommendation rules.

## Hard rules

- Store credential availability or references, never credential values.
- Treat inferred interests, companies, and skills as suggestions until accepted.
- Store writing voice only from user-approved examples or explicit tone direction. Never scrape a voice sample from private material without consent.
- Treat interests and goals separately. A topic can be interesting without advancing the active main goal.
- Do not silently select example goals such as a target job type or robust stock/trading algorithm; offer them only when supported and let the user choose.
- Record explicit dislikes and boredom signals so ranking can diversify.
- Manual queue order always outranks profile scoring.
- Default repository visibility to private.
- Set `auto_public: true` only from an explicit user instruction that clearly applies durably. A one-time request to publish one repository is not durable consent.
- Keep local-execution limits separate from remote-publication permission.

Return the active main goal, supporting goals, accepted profile changes, declined suggestions, affected queue items, and a copyable next prompt.
