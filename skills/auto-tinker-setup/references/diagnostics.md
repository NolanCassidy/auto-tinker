# Setup and diagnostics

## Expected workspace boundary

```text
workspace/
├── .auto-tinker/       # private canonical Markdown and derived cache
├── repos/auto-tinker/  # reusable public product checkout
├── tinkers/             # generated experiments
└── tasks/               # operator records
```

Never store raw chats, credentials, private journals, generated experiments, or the SQLite cache inside `repos/auto-tinker`.

## Diagnostic sequence

```bash
auto-tinker init --workspace /absolute/workspace --json
auto-tinker inspect-machine --workspace /absolute/workspace --json
auto-tinker doctor --workspace /absolute/workspace --json
auto-tinker index --workspace /absolute/workspace --json
auto-tinker doctor --workspace /absolute/workspace --json
```

Run the first command only for initialization. Use `auto-tinker <command> --help` before supplying optional repair flags not shown here.

## Doctor expectations

- Workspace paths resolve outside the product repository.
- Required Markdown folders and core configuration are readable.
- Records parse, stable IDs are unique, links resolve, and privacy values are valid.
- SQLite can be rebuilt from Markdown.
- machine profile is timestamped and sufficiently fresh for hard requirements.
- Git and GitHub authentication state can be detected without recording secret material.
- configured automation modes obey allowed directories, time/compute limits, and publication policy.

## Repair rules

- Back up or preserve malformed Markdown before schema repair.
- Represent corrections through superseding records when evidence changes.
- Never delete an unknown record to make validation pass.
- Never copy personal vault data into the public repo as an example.
- Treat unavailable GitHub auth as a publication limitation, not a blocker for local experiments.
