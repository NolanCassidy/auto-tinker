---
name: auto-tinker-setup
description: Initialize or diagnose a local Auto-Tinker workspace and inspect machine/tool readiness. Use for first setup, a moved workspace, stale machine specifications, or a broken vault/index; this skill does not configure automation or mutate GitHub.
---

# Auto-Tinker Setup

Create or repair a usable local workspace without placing personal data in the public product repository.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Workflow

1. Identify the intended workspace root. If the user is inside `repos/auto-tinker`, prefer its containing workspace unless they explicitly choose another location.
2. Run `auto-tinker init --workspace <path> --json` only when initialization is requested or no `.auto-tinker/config.md` exists. Preserve existing records.
3. Run `auto-tinker inspect-machine --workspace <path> --json`. Record capability and credential *presence* only; never read or store tokens, keys, or secret values.
4. Run `auto-tinker doctor --workspace <path> --json`.
5. If the index is missing or stale, run `auto-tinker index --workspace <path> --json`; do not repair canonical state by editing SQLite.
6. Resolve every error in CLI order, then rerun `doctor`. Read [diagnostics.md](references/diagnostics.md) for checks and safe remedies.

## Required result

Report the resolved workspace, vault, product repository, tinker repository root, index path, machine snapshot age, failed/waived checks, and the exact next chat prompt. State that generated remotes are private by default and that the viewer only produces copyable prompts.

Do not initialize GitHub repositories, enable automation, or set `auto_public` during setup. Route a separately requested remote mutation to `$auto-tinker-publish` and scheduler configuration to `$auto-tinker-automate`.
