# Setup and diagnostics

## Expected workspace boundary

```text
auto-tinker/
├── skills/, src/, docs/ # tracked reusable product
├── .auto-tinker/        # ignored private canonical Markdown and derived cache
├── tinkers/              # ignored generated experiment repositories
├── tasks/                # ignored operator records
└── private/              # ignored personal notes
```

The clone itself is the default workspace. Store personal state only in the ignored paths above. Never put raw chats, credentials, private journals, generated experiments, private notes, or the SQLite cache in tracked product files.

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

- Workspace paths resolve to the selected clone or an explicitly configured external workspace.
- In a source clone, `.auto-tinker/`, generated `tinkers/*`, `tasks/`, and `private/` are ignored by the product Git repository.
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
