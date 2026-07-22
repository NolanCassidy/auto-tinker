# Using Auto-Tinker through chat

Auto-Tinker is operated by talking to an agent that can load the repository's skills and run its `auto-tinker` CLI. The viewer is for seeing and safely arranging local state; it gives you copyable prompts instead of running an agent behind a button.

## Workspace layout

The clone is the default workspace. Git ignore boundaries keep reusable product files separate from private personal state:

```text
auto-tinker/
├── skills/, src/, docs/ # tracked reusable product
├── .auto-tinker/        # ignored private Markdown vault and derived local index
├── tinkers/              # ignored independent experiment repositories
├── tasks/                # ignored operator records
└── private/              # ignored personal notes
```

The CLI resolves a workspace from `--workspace`, `AUTO_TINKER_WORKSPACE`, or an ancestor containing `.auto-tinker/config.md`. A first-time user can clone the repository, open that folder, install dependencies, and paste:

> Use $auto-tinker-setup to initialize this Auto-Tinker clone as my local workspace, inspect my machine, run doctor, and tell me exactly which paths remain ignored and private.

The skills invoke `auto-tinker` when it is installed or linked. From the source clone they can run the same contract with `npm run cli -- <arguments>`. An advanced external workspace can still use `--workspace /absolute/workspace` or `AUTO_TINKER_WORKSPACE`.

## The 11 skills

| Skill | Ask it to |
|---|---|
| `$auto-tinker` | Route an ambiguous request or orchestrate an explicit multi-domain loop |
| `$auto-tinker-setup` | Initialize, inspect the machine, or diagnose the vault |
| `$auto-tinker-profile` | Change the main goal, supporting goals, interests, limits, dislikes, or privacy |
| `$auto-tinker-history` | Backfill, capture, reconcile, or deduplicate evidence |
| `$auto-tinker-discover` | Find and evaluate relevant current ideas |
| `$auto-tinker-queue` | Change queue state or select work without executing it |
| `$auto-tinker-run` | Plan, build, resume, and verify an experiment |
| `$auto-tinker-learn` | Create a lesson and update learning paths |
| `$auto-tinker-publish` | Perform every private/public GitHub remote mutation |
| `$auto-tinker-review` | Summarize daily/weekly progress, review writing, or query the graph |
| `$auto-tinker-automate` | Configure recurring-task policy and prompts without running them |

Each focused skill can be used on its own. Use `$auto-tinker` only when a request is ambiguous or intentionally spans multiple focused workflows. Queue changes state; run executes local code; history captures evidence; review owns status summaries; automate configures scheduling; publish alone mutates GitHub.

## Useful prompts

Profile and goals:

> Use $auto-tinker-profile to make “build a local-first developer tool people can run in ten minutes” my main goal. Keep reliable systems design as a supporting interest, show success criteria and the queue impact, and wait for my confirmation before switching.

> Use $auto-tinker-profile to help me choose between a target job type and a technical product goal. Do not silently set either one; keep exactly one main goal and save the other only if I approve it as supporting.

Discovery and queue:

> Use $auto-tinker-discover to add a daily GitHub local-first search source with weight 1.2 and techniques for recent updates, releases, issue quality, and language filtering. Save the retrieval date and trust/rate-limit notes, then show me the resulting source ID.

> Use $auto-tinker-discover to find five current TypeScript or Rust ideas that fit this machine. Include one surprising adjacent idea, licenses, primary sources, exact experiments, main-goal contribution, distraction risk, and explain every score.

> Use $auto-tinker-queue to show my candidates, star the durable-workflow idea, move it to rank 1, block anything requiring CUDA, and prepare a copyable run prompt for the top item. Do not execute it.

Execution:

> Use $auto-tinker-run to run candidate cand-123 as a private from-scratch experiment. Establish a baseline, make one meaningful working feature, verify it, and stop rather than claim completion if the tests fail.

> Use $auto-tinker-run to resume exp-123. First verify where its code currently exists; if no local or remote code is available, preserve the knowledge and tell me what is needed instead of inventing a path.

History and learning:

> Use $auto-tinker-history to dry-run a backfill from this Codex export, preserve provenance, allow missing repository locations, and tell me the imported, merged, uncertain, and skipped counts.

> Use $auto-tinker-learn to teach me what experiment exp-123 proved, update only evidence-supported capabilities, explain its main-goal contribution, and give me three different next learning branches.

Review and publication:

> Use $auto-tinker-review to reconcile today, show exact evidence and queue changes, distinguish missing code from missing knowledge, and generate tomorrow's copyable run prompt.

> Use $auto-tinker-publish to dry-run a private GitHub repository for exp-123. Check tests, secrets, license, attribution, README journal, and destination. Do not create it until I approve the private remote mutation.

> Use $auto-tinker-publish to review exp-123 for public visibility. Show the exact code, README, changelog, public story, attribution, license, repository-publication approval, and actual remote visibility as separate gates; do not publish unless every applicable gate passes.

Automation:

> Use $auto-tinker-automate to prepare a 6 PM daily reconciliation and discovery task. It may propose one experiment that advances my main goal but may not edit code, create a remote, or publish. Give me the exact task prompt and pause instructions.

> Use $auto-tinker-automate to save a 60-minute `execute-local` daily policy with concurrency 1, prepare the exact scheduler task, and keep remote creation and public publication disabled.

## Goals, interests, and ranking

Auto-Tinker keeps exactly one active main goal in `goals/main.md` and allows multiple supporting goals. Interests influence discovery but do not become goals automatically. Every candidate and queued item should explain how it advances the main goal or risks distracting from it. The exploration budget allows deliberate surprises without hiding the tradeoff.

## Privacy and repository behavior

- Canonical personal state is local Markdown. SQLite is a rebuildable viewer index.
- Knowledge may come from chats, notes, tests, or snapshots even when code no longer exists locally or on GitHub. Auto-Tinker marks locations missing/unverified instead of inventing links.
- New experiment remotes are private. Public visibility requires `repository_publication_approval: approved`, explicit repository-publication approval in the current publish chat, or durable `auto_public: true`.
- A one-time “publish this repo” instruction does not enable auto-public for future work.
- `readme_review`, `public_story_review`, factual `attribution`, `license_review`, and `repository_publication_approval` are independent local fields.
- `journal review` or `writing_approval` means the text was reviewed. It is never permission to make a GitHub repository public.
- Local `repository_publication_approval: approved` is permission state, not proof that GitHub is public. Publication still runs through chat and verifies actual visibility.
- Private remote creation, push, and public visibility are separate actions.
- Experiment-record privacy and remote creation visibility are separate: `review` is local workflow state, while every new GitHub remote is created private.
- Private creation requires a clean committed local repository, pushes it explicitly, and records success only after GitHub reports private visibility plus the expected default branch and HEAD SHA.
- The viewer may star, reorder, schedule, block, mark reviewed/approved, edit safe metadata, and copy prompts. It does not invoke models, skills, Git, GitHub, shells, or schedulers.

## Four different writing artifacts

Auto-Tinker keeps these linked but separate:

1. The **private journal** is candid about context, failures, uncertainty, and next steps.
2. The **repository README** explains the code, reproduction, attribution, and a prominent `What I changed / learned` journal.
3. The **dated changelog** is a concise chronological record of outcomes.
4. The **public story** is a separately privacy-reviewed narrative in the coder's approved voice.

Only the README requires a repository. The other records can preserve useful learning when code is gone or was never available.

Writing voice comes from approved profile examples. Without them, the default is plain first person: why I picked it, what interested or annoyed me, attempts and struggles, what I changed, how I verified it, and what I learned. Public text removes private details and avoids generic AI hype.

## Direct CLI checks

Agents should use JSON when chaining commands:

```bash
auto-tinker doctor --workspace /absolute/workspace --json
auto-tinker profile show --workspace /absolute/workspace --json
auto-tinker config show --workspace /absolute/workspace --json
auto-tinker goal show --workspace /absolute/workspace --json
auto-tinker source list --workspace /absolute/workspace --json
auto-tinker queue list --workspace /absolute/workspace --json
auto-tinker index --workspace /absolute/workspace --json
auto-tinker graph --workspace /absolute/workspace --json
```

Use `auto-tinker <command> --help` for the installed version's mutation flags. Deterministic state changes belong to the CLI; research, coding judgment, teaching, and review belong to the agent.

Safe chat-owned defaults and a structured source example:

```bash
auto-tinker config update --workspace /absolute/workspace --json \
  --preferred-agent codex --max-concurrency 2 \
  --automation-mode discover-only --time-budget-minutes 60 \
  --discovery-sources "source-catalog-0123456789abcdef,github-trending"
auto-tinker source add --workspace /absolute/workspace --json \
  --title "GitHub release search" --kind github-search \
  --url "https://github.com/search?q=topic%3Aagents&type=repositories" \
  --cadence daily --weight 1.2 \
  --topics "agents,local-first" --languages "TypeScript,Rust" \
  --techniques "sort by updated,check releases and open issues" \
  --trust-notes "Use primary repository evidence and record the retrieval date."
auto-tinker source add --workspace /absolute/workspace --json \
  --title "Local Git and task history" --kind local-history \
  --locator local://codex-history --weight 1.2 \
  --techniques "reconcile stable source IDs,inspect bounded Git and task summaries"
```

The viewer may display these values and generate a copyable prompt. It does not run the configured agent, source queries, or concurrent experiments.

Writing and repository approval are intentionally separate:

```bash
auto-tinker journal review <journal-id> --workspace /absolute/workspace --json --state approved
auto-tinker experiment update <experiment-id> --workspace /absolute/workspace --json \
  --readme-review approved --public-story-review approved \
  --attribution "Adapted from <project> at <url>@<revision> under <license>; delta: <change>." \
  --license-review compatible
auto-tinker experiment update <experiment-id> --workspace /absolute/workspace --json \
  --repository-publication-approval approved
```

The last command grants local repository-publication consent. The first two do not. Actual GitHub visibility changes only when `$auto-tinker-publish` runs and verifies the remote.

If an older experiment shows a stale linked-output timestamp, repeat `journal review <journal-id> --state pending`. It refreshes the parent link from the canonical journal while leaving both writing approval and repository consent pending.
