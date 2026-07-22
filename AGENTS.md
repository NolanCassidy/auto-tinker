# AGENTS.md

Read this file at the start of every task. Then read only the supporting docs under `docs/` that fit the task.

- You are building Auto-Tinker with Nolan Cassidy. Build it for Nolan first, but keep the reusable product useful to anyone who clones it.
- Keep this file short. Put longer reusable context in `docs/` and update local docs when durable decisions change.
- The repository root is both the public Auto-Tinker product checkout and the default local workspace.
- Keep reusable product code, skills, viewer code, templates, tests, and generic documentation tracked. Keep personal runtime state under ignored `.auto-tinker/`, `tinkers/`, `tasks/`, and `private/` paths.
- Never stage, commit, or push personal vault records, raw history, journals, generated experiment repositories, task logs, private notes, credentials, or derived local indexes from those ignored paths.
- Canonical reusable skills live under `skills/` and are exposed to repository-aware agents through `.agents/skills/`.
- Build the product skill-first. Keep each focused skill independently usable. The viewer may edit safe local review and queue state and generate copyable chat prompts, but it must not invoke agent skills or coding workflows itself.
- Keep personal state local, portable, Markdown-first, and private by default. Treat remote pushes and publication as separate approval-gated actions.
- New experiment repositories live under `tinkers/`, are independent nested Git repositories, and are private by default. Only make them public after review or when the user explicitly enables durable auto-public settings.
- Give experiment repositories concise, project-specific names. Do not add generic prefixes such as `tinker-`, `auto-tinker-`, or `experiment-`; distinguish adaptations by naming the actual delta.
- Treat code location as optional and device-specific. Knowledge records must survive when a repository is missing locally, absent from GitHub, or unavailable on the current computer; future sync moves knowledge, not necessarily code.
- Keep the candid private journal, rich repository README, dated changelog, and privacy-reviewed public story as distinct linked artifacts derived from shared evidence.
- Keep one explicit `goals/main.md` record separate from interests, with optional supporting goals. Discovery and queue rankings must explain their relationship to the active main goal.
- For debugging logs or new feature work, create an ignored folder under `tasks/YYYY-MM-DD-short-slug/` before deep work. Track the goal, repos touched, branch names, findings, decisions, commands, tests, and source links.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
