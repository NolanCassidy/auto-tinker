---
name: auto-tinker-history
description: Import, capture, reconcile, and deduplicate evidence from accessible Codex or ChatGPT history, Git records, task notes, and current sessions. Use for bounded backfills, end-of-session capture, or end-of-day evidence reconciliation; use auto-tinker-review for progress summaries.
---

# Auto-Tinker History

Build an evidence-backed work history without claiming access to chats or systems the current agent cannot read.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Choose a mode

- **Backfill:** enumerate accessible sources, preview scope, then call `auto-tinker history import <path> [--limit <n>]` once per bounded source. Use `--dry-run` before a sensitive or large import.
- **Capture:** inspect the current repository diff, commits, commands, tests, and task notes, then call `auto-tinker history capture --title <title> --summary <markdown>` with exact `--source-ref` and `--tags` values.
- **Reconcile:** call `auto-tinker history reconcile` for the requested date/range; inspect duplicates and uncertain links before accepting curated results.
- **Backfilled records:** append a sourced `private-journal` or dated `changelog` only when the requested history import needs one. Preserve imported README/public-story material as evidence; do not take ownership of publication review or a status summary.

Run every command with `--workspace <path> --json`; inspect the subcommand's `--help` for source/path/date flags. Read [evidence-and-dedup.md](references/evidence-and-dedup.md) before a backfill or multi-source reconciliation.

## Evidence rules

- Preserve source type, source locator, observed timestamp, confidence, and privacy.
- Preserve knowledge from a chat, note, diff, or test snapshot even when no code location is available. Store repository locations as missing/unverified instead of guessing.
- Import metadata or summaries when full raw content would expose private material unnecessarily.
- Redact secret values and unrelated personal data before persistence.
- Distinguish observed facts, user claims, and inference.
- Keep append-only event receipts. Correct evidence with a `supersedes` relationship rather than silent deletion.
- Rerunning the same import or reconciliation must not create duplicate events, changelog entries, or journal entries.
- Never convert private company details into public prose. Preserve the evidence privately and hand public-story drafting to `$auto-tinker-publish`.

Keep the candid private journal, repository README, dated changelog, and privacy-reviewed public story as four linked artifacts whenever they already exist. Do not water down the private record to make it publishable. A history backfill may create evidence-backed private-journal and changelog records; `$auto-tinker-run`, `$auto-tinker-learn`, and `$auto-tinker-publish` own new work outputs.

Use only user-approved profile voice examples. Without one, write directly in first person about why the work was chosen, what interested or annoyed the user, attempts and struggles, the change, verification, and learning; avoid generic AI hype.

Finish with imported/skipped/merged counts, exact created record IDs, gaps, and low-confidence items needing review. Hand off to `$auto-tinker-review` when the user wants a daily, weekly, project, or capability summary.
