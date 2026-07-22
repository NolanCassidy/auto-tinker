---
name: auto-tinker-setup
description: Initialize or diagnose a local Auto-Tinker workspace and inspect machine/tool readiness. Use for first setup, a moved workspace, stale machine specifications, or a broken vault/index; this skill does not configure automation or mutate GitHub.
---

# Auto-Tinker Setup

Create or repair a usable local workspace without placing personal data in tracked product files.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Workflow

1. Identify the intended workspace root. When the user is inside an Auto-Tinker source clone, prefer that clone itself. Use an external workspace only when the user explicitly chooses one or existing configuration points there.
2. Run `auto-tinker init --workspace <path> --json` only when initialization is requested or no `.auto-tinker/config.md` exists. Preserve existing records.
3. Run `auto-tinker inspect-machine --workspace <path> --json`. Record capability and credential *presence* only; never read or store tokens, keys, or secret values.
4. Run `auto-tinker doctor --workspace <path> --json`.
5. If the index is missing or stale, run `auto-tinker index --workspace <path> --json`; do not repair canonical state by editing SQLite.
6. Resolve every error in CLI order, then rerun `doctor`. Read [diagnostics.md](references/diagnostics.md) for checks and safe remedies.

## Required result

Report the resolved workspace, vault, product repository (when present), tinker repository root, index path, machine snapshot age, failed/waived checks, and the exact next chat prompt. State which paths are Git-ignored, that generated remotes are private by default, and that the viewer only produces copyable prompts.

Do not initialize GitHub repositories, enable automation, or set `auto_public` during setup. Route a separately requested remote mutation to `$auto-tinker-publish` and scheduler configuration to `$auto-tinker-automate`.
