# History evidence and deduplication

## Source adapters

Use only adapters reachable in the current environment:

- Codex task/history files exposed locally by the product
- user-provided ChatGPT export files
- local Git repositories, reflogs, diffs, and test artifacts
- GitHub activity available through authenticated tools
- task records, reports, notebooks, and user-provided notes

State inaccessible sources explicitly. Never say “all history” when only one adapter was available.

## Bounded import sequence

1. Inventory source, location, date range, expected sensitivity, and approximate item count.
2. Preview what will be persisted.
3. Run `auto-tinker history import --help`, then invoke it with the narrowest supported source/path/range arguments and `--json`.
4. Review counts and low-confidence records.
5. Run `auto-tinker history reconcile --workspace /absolute/workspace --json` for the bounded date range.
6. Run `auto-tinker index --workspace /absolute/workspace --json`.

## Deduplication signals

Prefer stable upstream IDs. Otherwise combine available source locator, optional repository/commit, normalized time window, goal, and evidence hashes. Repository and commit may be absent. Similar summaries alone are insufficient: two sessions can describe the same goal while recording distinct work.

Reconciliation should merge references into one curated arc while keeping original event receipts. A second identical run should report existing/merged items and create no duplicate journal entry.

## Good backfilled changelog content

Lead with what became possible, changed, failed, or was learned. Include technologies only in context. Cite exact commits when available, plus tests, evidence snapshots, experiment IDs, and lessons. This is evidence capture, not a daily/weekly status review. Hand broad summaries to `$auto-tinker-review`.

## Four linked writing artifacts

- **Private journal:** candid context, decisions, failures, uncertainty, and next steps; `journal append --kind private-journal`.
- **Repository README:** code, setup, attribution, current result, and the prominent learning journal; `--kind readme`, only when a repository exists and normally authored by run/publish.
- **Dated changelog:** concise chronological outcome linked to evidence and lesson IDs; `--kind changelog`.
- **Public story:** privacy-reviewed narrative in the user's evidenced voice; `--kind public-story`, normally authored by publish and reviewed independently from repository-publication consent.

Link the records. Do not require a repository for the journal, changelog, public-story draft, lesson, or capability node.

```bash
auto-tinker journal append --workspace /absolute/workspace --json \
  --kind private-journal --title "Experiment notes" --body "Candid evidence-backed narrative." --experiment <id>
auto-tinker journal append --workspace /absolute/workspace --json \
  --kind changelog --title "YYYY-MM-DD changes" --body "Concise outcomes." --date YYYY-MM-DD --experiment <id>
```

History normally creates only the first two records during backfill. Preserve imported README/public-story content as linked evidence; use the run/publish workflow to author or update it and `$auto-tinker-review` to change writing-review state.
