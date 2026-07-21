# Changelog

All notable public changes to Auto-Tinker are documented here.

## 0.1.0 - 2026-07-21

### Added

- Eleven independently usable skills for setup, profile and goals, history, discovery, queueing, experiments, learning, review, automation policy, and approval-gated publishing.
- A Node.js CLI backed by a portable Markdown vault and rebuildable SQLite index.
- A local Next.js viewer for reviewing the knowledge graph, queue, lessons, journal, and publication readiness without executing agent workflows.
- Private-by-default repository workflows, explicit publication approvals, secret redaction, and evidence-linked writing layers.
- Self-contained npm packaging for the compiled CLI, product documentation, skills, and Codex plugin manifest.
- Canonical, unique, immutable discovery-source locators and a scheduler-safe daily prompt capsule with absolute mutation roots, date/timezone scope, saved limits, and explicit stop rules.

### Fixed

- Re-importing identical timestamp-less history now reuses the original `history-captured` event instead of adding a new event on every run.
- Production npm installs now contain only the compiled CLI and its runtime dependencies; viewer-only Next.js and React packages stay in development installs.
- Viewer mutations now rebuild the derived index through Node's built-in SQLite module and report a repair warning without pretending a canonical Markdown write was rolled back.
- Next.js-normalized loopback aliases are accepted when their ports match, while remote hosts, port mismatches, and cross-origin mutations remain blocked.
- The mobile navigation drawer and durable auto-public switch expose unambiguous accessibility state.

### Security

- Denied browser framing globally with CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- Blocked adaptation plans, private repository creation, and publication whenever the owned destination equals any recorded GitHub source, including backfilled source artifact locations.
- Made private creation and public readiness scan the exact tracked Git tree and fail closed on secrets, unreadable files, binaries, symlinks, oversized files, or other incomplete coverage without treating ignored dependencies as publishable content.
- Bound publication evidence to the exact reviewed commit and verify the clean local origin/branch/SHA plus the exact private and public GitHub identity, default branch, and SHA around the visibility change.
- Made private-creation and publication dry-runs perform the same local Git, collision, revision, and scan preflights as execution before making zero GitHub mutations.
