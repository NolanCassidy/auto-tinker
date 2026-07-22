# Auto-Tinker

Your coding agent should not forget everything you built yesterday.

Auto-Tinker is a local-first learning and experimentation workspace for developers who constantly try repositories, tools, models, hardware, and ideas. It gives Codex and other skill-aware agents a durable Markdown knowledge graph, an explainable experiment queue, private-by-default GitHub workflows, thorough learning journals, and a visual local viewer.

The chat is the control surface. The viewer helps you understand and review state; it never secretly starts an agent.

## What it does

- Backfills accessible agent history, Git evidence, and user notes into a linked work graph.
- Keeps one explicit main goal separate from interests and supporting goals.
- Discovers relevant repositories and concepts using a durable source catalog with bounded weights, repeatable query techniques, topic/language filters, machine constraints, and transparent ranking.
- Lets you star, reorder, schedule, block, and select one or several experiments through chat, then execute them with a separate run skill.
- Stores an explicit bounded automation mode and time budget; unattended work defaults to discovery-only and public publication stays separate.
- Creates generated experiment repositories as **private by default**.
- Gives experiments concise, project-specific repository names rather than generic workspace-prefixed names.
- Runs bounded local experiments, verifies them, and records failures as real evidence.
- Produces four linked writing layers: candid private journal, rich README, dated changelog, and privacy-reviewed public story.
- Keeps knowledge even when the original code lives on another computer, was never pushed, or is no longer available.
- Shows the graph, queue, lessons, journal, missing-code state, and publication readiness in a local Next.js viewer.
- Generates exact prompts to copy into Codex, ChatGPT, or another coding agent instead of putting agent-trigger buttons in the app.

## Local-first model

An Auto-Tinker clone is both the public product checkout and the default local workspace. Tracked product files and ignored personal state share one convenient folder without sharing one Git history:

```text
auto-tinker/
├── skills/, src/, docs/ # tracked reusable product
├── .auto-tinker/        # ignored private Markdown vault + rebuildable SQLite index
├── tinkers/              # ignored nested experiment repositories
├── tasks/                # ignored local operator records
└── private/              # ignored personal notes
```

Markdown is the source of truth. SQLite is only a local search and graph index. A future hosted sync can synchronize the knowledge graph without pretending every source repository exists on every device.

## Quick start

Requirements: Node.js 22 or newer, npm, Git, and optionally an authenticated GitHub CLI for repository workflows.

Clone Auto-Tinker, open that folder as your coding-agent project, and initialize it in place. The repository ignores the personal vault, local task logs, private notes, and every generated child repository under `tinkers/`.

```bash
git clone https://github.com/NolanCassidy/auto-tinker.git
cd auto-tinker
npm install

# Create ignored local state in this clone.
npm run setup

# Inspect configuration and machine compatibility.
npm run cli -- --workspace . inspect-machine
npm run cli -- --workspace . doctor

# Run the local viewer; it finds this workspace automatically.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Run `npm run cli -- --help` for the complete deterministic command surface. Normal usage should happen through the included skills rather than by memorizing CLI flags.

Advanced users can keep personal state in another folder by passing `--workspace /absolute/path` or setting `AUTO_TINKER_WORKSPACE`. The in-clone layout is the supported first-run default, not a requirement.

## Use through chat

The repository ships eleven focused skills under `skills/` and exposes them to Codex from `.agents/skills/`:

- `auto-tinker` — route ambiguity or orchestrate an explicit multi-domain loop
- `auto-tinker-setup` — initialize, inspect the machine, and diagnose
- `auto-tinker-profile` — interests, main/supporting goals, voice, and constraints
- `auto-tinker-history` — backfill, capture, reconcile, and evidence deduplication
- `auto-tinker-discover` — source search, candidate evaluation, and recommendations
- `auto-tinker-queue` — star, rank, schedule, block, and select state
- `auto-tinker-run` — plan, sandbox, build, change, and verify
- `auto-tinker-learn` — lessons, capabilities, and learning paths
- `auto-tinker-publish` — every private/public GitHub remote mutation
- `auto-tinker-review` — daily/weekly summaries, writing review, and graph queries
- `auto-tinker-automate` — scheduler policy and task prompts, without execution

Example prompts:

```text
Use $auto-tinker-setup to initialize this clone as my workspace and inspect my computer.

Use $auto-tinker-history to backfill the Codex work you can access. Keep company details private and show me uncertain matches.

Use $auto-tinker-profile to make publishing a verified portfolio of accessible developer tools my main goal. Keep deepening my Rust systems skills as a supporting goal.

Use $auto-tinker-discover to find 20 current TypeScript, Python, or Rust projects that fit my main goal and this computer. Explain every score.

Use $auto-tinker-discover to add GitHub release search to my source catalog with a neutral weight, daily cadence, and exact query techniques, then use it to refresh candidates.

Use $auto-tinker-queue to star the first two, move the local-memory idea to the top, and return separate run prompts without executing them.

Use $auto-tinker-run to work the top ready experiment end to end. Make a meaningful verified change, not a README-only contribution.

Use $auto-tinker-publish to create its GitHub repository privately, update the README in my voice, and prepare a public story for review. Do not make it public yet.
```

The viewer contains matching copy-to-chat prompts for common actions. See [chat usage](docs/chat-usage.md) for the complete workflow.

## Privacy and publication

- Personal vaults, raw history, journals, SQLite indexes, local task logs, private notes, and generated experiment repositories live inside the clone but are ignored and never become part of its public Git history.
- New GitHub experiment repositories are private. Public visibility requires separate `repository_publication_approval`, explicit current-chat consent, or durable `auto_public: true`.
- README review, public-story review, writing approval, repository-publication approval, and actual GitHub visibility are separate. Clicking “approved” in the viewer does not call GitHub.
- Public stories are generated from reviewed evidence, not copied from private journals.
- Credentials are referenced by availability only and are never written to Markdown.
- Missing code does not delete its history or learning graph.
- A local record in `review` state is not a request for a review-visible remote: repository creation is always private and verifies its pushed branch/SHA before being recorded.

## Architecture

- Next.js 16 + React 19 local viewer
- TypeScript CLI and core library
- Markdown with YAML frontmatter as canonical state
- Node built-in SQLite as a derived index
- Open Agent Skills-compatible skill folders
- Codex plugin manifest for distribution

Read [the POC architecture](docs/architecture.md) for record boundaries, writing layers, privacy gates, and workflow tests.

## Development

```bash
npm test
npm run lint
npm run build
npm run cli:build
```

The repository intentionally has no agent-execution endpoint. If a future hosted product adds accounts, sync, or public profiles, the local Markdown export remains a first-class portable source.

## License

MIT © 2026 Nolan Cassidy
