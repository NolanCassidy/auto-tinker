# Auto-Tinker POC architecture

## Repository boundary

This public product repository contains the reusable skill suite, local CLI/core, local viewer, schemas, examples, and tests.

It does not contain a user's private vault, raw chat history, generated experiment repositories, credentials, or SQLite cache. Those live in a containing Auto-Tinker workspace:

```text
workspace/
├── .auto-tinker/       # private Markdown vault + derived cache
├── repos/
│   └── auto-tinker/    # this public product repository
├── tinkers/            # generated experiment repositories, private by default
├── tasks/               # operator records
└── docs/                # workspace-level product notes
```

Resolve the workspace in this order:

1. explicit `--workspace <path>`
2. `AUTO_TINKER_WORKSPACE`
3. walk upward from the current directory until `.auto-tinker/config.md` is found
4. for initialization only, use the requested target or current directory

## Source of truth

Canonical user state is Markdown with YAML frontmatter under `.auto-tinker/`. SQLite is a disposable derived index for fast viewer queries and graph layout. Rebuilding the database from Markdown must never lose state.

Each record has:

- `id`, `type`, `title`, `status`, `created_at`, `updated_at`
- `privacy`, `confidence`, `tags`, `links`, and `source_refs`
- readable Markdown content

Discovery-source records additionally store a credential-free locator, source kind, enabled state, topics, languages, cadence, a bounded `0..2` ranking weight, repeatable query techniques, strengths, rate-limit/trust notes, and a retrieval timestamp. Web sources use normalized HTTP(S) URLs; local/user-owned sources use `local://<safe-alias>` and never an absolute path. IDs are derived from normalized locators so renaming a source does not change its identity. New workspaces seed a local-history source for accessible Codex/Git/task evidence. Source weight is a transparent prior, never a replacement for current evidence or main-goal alignment.

Workspace config stores explicit automation scope as `automation_mode` (`discover-only`, `prepare-only`, `execute-local`, `draft-contribution`, or `create-private-remote`) and a bounded `time_budget_minutes`. The default is `discover-only`; public visibility remains governed separately by publication consent and `auto_public`.

Maintain exactly one active main-goal record at `.auto-tinker/goals/main.md`, separate from interests and optional supporting goals. Include outcome, success criteria, horizon, priority, constraints, status, and exploration budget. Candidate and queue records must state whether and how they advance the main goal or represent intentional exploration.

Maintain a user-owned writing-voice profile containing preferred tone, detail, first-person patterns, approved examples, and phrases to avoid. Update it only from explicit feedback or approved writing—not by silently mining private chats. README and public-story generation should sound like the coder explaining why they chose the work, what they tried, what struggled or failed, what changed, how it was verified, and what they learned.

Code is not required to be present. Project and experiment records must support zero or more locations:

- `local` path on a named device
- `github` or another forge URL
- another remote/archive reference
- `unknown` when only historical knowledge remains

Every location carries `availability` (`present`, `missing`, or `unverified`), `device_id` when applicable, `last_seen_at`, and an optional revision/content hash. A missing checkout must never delete or hide the knowledge node. Preserve small evidence snapshots and summaries so a cloud-synced graph remains useful even when code itself does not sync.

GitHub locations may also carry `repository_role: source|destination`. Publication planning uses only the explicit experiment-owned destination (`repo_url` or a destination-role location); an upstream/source artifact is never a publication target.

Store sanitized machine identities under `.auto-tinker/devices/` so local paths can be understood across computers. Use a user-editable device label and a generated ID; store compatibility facts, not serial numbers, account names, credentials, or other unnecessary identifiers.

Use append-only records under `events/` for observations. Curated records in other folders represent current state. Preserve corrections through `supersedes` links rather than erasing evidence.

## Privacy and publication

- `private`: local/private remote only; default for every experiment and journal.
- `review`: ready for the user to inspect, edit, and approve.
- `public`: explicitly approved or allowed by durable `auto_public: true` settings.

Remote repository defaults:

- create every generated experiment repository as private
- distinguish local experiment-record privacy from remote creation visibility; `review` never means a GitHub visibility
- require a clean committed local repository and create/push in one explicit GitHub CLI operation
- verify actual private visibility, default branch, and remote SHA against local HEAD before recording the remote
- allow the UI to mark it reviewed but never call GitHub itself
- make public only through the publish skill/CLI after checking the durable policy
- support chat edits before publication
- write a clearly separated `What I changed / learned` section at the top of experiment READMEs
- append dated entries when returning to an existing experiment repository

## Writing layers

Generate four distinct but linked artifacts from the same evidence:

1. **Private journal** — candid goal, motivation, context, attempts, struggles, dead ends, decisions, full technical detail, result, uncertainty, and next questions. Private by default and never copied wholesale into public output.
2. **Repository README** — unusually readable project narrative at the top: the author's reason for choosing it, inspiration/upstream attribution, what was built or changed, how it works, verification, learning, and how to run it. Keep upstream documentation below when adapting an existing repository.
3. **Dated changelog** — concise append-only entries linked to experiments, capabilities, evidence, and lessons. Returning to a repo adds an entry rather than rewriting its history.
4. **Public story draft** — a fuller `why -> what -> how -> result -> learning` narrative in the coder's voice, with privacy/anonymity controls and explicit approval state.

Store links between these artifacts in the graph. Approval of one output does not approve another.

Journal review refreshes the parent experiment's denormalized `linked_outputs[].updated_at` from the canonical journal record. Repeating `journal review <id> --state pending` is an idempotent repair for an older stale link and grants no writing or repository-publication approval.

Track `readme_review`, `public_story_review`, factual `attribution`, `license_review`, and `repository_publication_approval` independently. Reviewing a journal record with `journal review <id> --state` or setting any writing approval never grants repository-publication consent. Actual GitHub visibility is a separate observed field.

## Chat-first skill suite

Use eleven focused skills rather than the original thirty-seven top-level skills:

1. `auto-tinker` — route ambiguous requests or orchestrate explicit multi-domain loops
2. `auto-tinker-setup` — initialize, inspect machine, and diagnose
3. `auto-tinker-profile` — interests, goals, constraints, and preferences
4. `auto-tinker-history` — backfill, capture, reconcile, and deduplicate evidence
5. `auto-tinker-discover` — sources, candidate search, evaluation, and recommendations
6. `auto-tinker-queue` — star, rank, schedule, block, and select local queue state
7. `auto-tinker-run` — plan, sandbox, build, change, and verify experiments
8. `auto-tinker-learn` — lessons, capability graph, and learning paths
9. `auto-tinker-publish` — all GitHub remote creation, push, and visibility mutations
10. `auto-tinker-review` — daily/weekly summaries, writing review, and graph queries
11. `auto-tinker-automate` — scheduler policy and task-prompt configuration only

Queue changes state but never executes. Run executes local code but never mutates GitHub. History captures evidence; review owns cross-record status summaries. Automate configures future task prompts without running them. Publish alone performs GitHub remote mutations.

All skills live in `skills/` for plugin distribution and are symlinked from `.agents/skills/` for repository discovery.

## Core commands

Expose one `auto-tinker` CLI with machine-readable JSON output and human-readable defaults:

- `init`, `doctor`, `profile`, `config`, `inspect-machine`
- `history import`, `history capture`, `history reconcile`
- `source list`, `source add`, `source update`, `discover`, `candidate add`, `candidate evaluate`
- `queue list`, `queue update`, `queue next`
- `experiment create`, `experiment update`, `experiment complete`
- `lesson create`, `journal append`, `journal review`
- `index`, `graph`, `prompt`
- `repo plan`, `repo create-private`, `repo publish`

Skills may combine CLI calls with normal agent tools. The CLI owns deterministic state changes; the agent owns research, coding judgment, teaching, and GitHub review.

## Viewer boundary

The Next.js viewer reads the derived SQLite index and source Markdown. It may:

- show dashboard, graph, queue, experiments, lessons, changelog, sources, and settings
- star, reorder, schedule, block, mark reviewed, and edit safe local metadata
- generate exact copyable prompts for Codex/ChatGPT/another agent
- show privacy and publication readiness
- show whether code is local, on a forge, elsewhere, missing, or knowledge-only on this device
- keep graph/history/journal nodes visible even when their code is unavailable
- show the private journal, README, changelog, and public-story readiness as separate linked surfaces

It may not:

- invoke a skill, model, Codex CLI, or coding agent
- clone, edit, test, commit, push, publish, or schedule an automation
- store credentials or raw secrets

## Three required workflow tests

1. Backfill accessible Codex history, derive profile/capabilities, discover an idea, create a from-scratch private experiment, verify it, and create its lesson/journal.
2. Discover and inspect a public repository, import it into a private adaptation repository with attribution, make a meaningful verified change, and prepare but do not publicize it.
3. Reopen an existing experiment, append a dated README/journal entry, make another verified improvement, update the graph, and prove daily reconciliation deduplicates it.

Each workflow must be visible in the local viewer and leave exact Markdown evidence.
