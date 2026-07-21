---
name: auto-tinker-publish
description: Own every Auto-Tinker GitHub remote mutation by planning or creating a private experiment repository, pushing reviewed commits, and changing approved repository visibility. Use for private remote creation, remote updates, publication readiness, portfolio README/public-story preparation, or public release; no other Auto-Tinker skill mutates GitHub.
---

# Auto-Tinker Publish

Treat writing review, repository-publication approval, private remote creation, pushing, and actual public visibility as distinct actions.

Invoke the CLI as `auto-tinker`; from an unlinked source checkout use `npm --prefix <auto-tinker-product-repo> run cli --` followed by the same arguments.

## Resolve and prepare

1. Read the experiment and run `auto-tinker repo plan <experiment-id> --workspace <path> --json`. For adaptations, confirm the plan targets only `repo_url` or an explicit destination-role location, never `source_repository` or an upstream GitHub artifact.
2. Verify the current local code path and Git identity. If code is missing or the path is unverified, preserve the experiment/lesson and explain what must be restored; never publish an evidence snapshot as if it were a repository.
3. Inspect status, commits, tests, secrets, large files, license, authorship, upstream attribution, generated content, destination owner/name, and current `repository_publication_approval`, `readme_review`, and `public_story_review` states.
4. Maintain a clear `What I changed / learned` section at the top of the README. For revisits, append a dated entry without erasing the original project documentation. Use [readme-journal.md](assets/readme-journal.md) as a shape, not text to copy blindly.
5. Keep separate linked records using `auto-tinker journal append --kind private-journal|readme|changelog|public-story`. Review a writing record with `auto-tinker journal review <journal-id> --state <pending|approved>`. The public story must exclude private-company details, secrets, unsupported claims, and others' identities.
6. Write in the user's voice only from approved profile examples. Otherwise use plain first person: why I picked it, what interested or annoyed me, attempts and struggles, what I changed, how I verified it, and what I learned. Remove private detail and generic AI hype from public output.

## Create or update private work

1. Preview with `auto-tinker repo create-private <experiment-id> --dry-run --workspace <path> --json`.
2. Show owner, name, fixed creation visibility (`private`), local branch/HEAD, attribution, and tests. Record privacy such as `review` is not a GitHub visibility request.
3. After the user authorizes this external mutation—or durable automation policy explicitly permits private remote creation—run the command without `--dry-run`.
4. Require a clean committed local repository with no existing `origin`; creation uses one explicit `gh repo create --private --source <path> --remote origin --push` operation. Verify the returned GitHub URL, actual private visibility, default branch, and remote SHA against local HEAD before recording success. No writing-review or repository-publication approval value changes GitHub visibility by itself.

## Publish publicly

1. Run `auto-tinker repo publish <experiment-id> --dry-run --workspace <path> --json`.
2. Confirm verification, destination, current visibility, and every independent gate: `--readme-review approved`, `--public-story-review approved`, truthful `--attribution <text>`, `--license-review compatible|approved`, and `--repository-publication-approval approved` as applicable.
3. Persist reviewed experiment gates explicitly when authorized:

   ```bash
   auto-tinker experiment update <experiment-id> --workspace <path> --json \
     --readme-review approved --public-story-review approved \
     --attribution "Adapted from <project> at <url>@<revision> under <license>; delta: <change>." \
     --license-review compatible
   auto-tinker experiment update <experiment-id> --workspace <path> --json \
     --repository-publication-approval approved
   ```

   The second command is publication consent. Never infer it from a writing review, `writing_approval`, or an approved public-story draft.
4. Proceed only in this chat-invoked skill when `repository_publication_approval` is already `approved`, the user explicitly approves this run (pass `--approve`), or the CLI confirms durable `auto_public: true`.
5. If no repository-publication gate passes, leave the repository private and return the exact prompt the user can copy to request review/publication.
6. After mutation, verify public visibility and URL; then record the actual result in the experiment and changelog. Never report public based only on local approval.

Read [publication-gates.md](references/publication-gates.md) before any remote mutation.

The viewer may set local review/approval state and emit the exact copyable prompt for this skill. It must never create, push, or publish the repository itself.
