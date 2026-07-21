# Publication gates

## Location gate

Classify code location as verified local, verified remote, both, missing, or unverified. A lesson can exist without code; a repository operation cannot. Confirm the local checkout corresponds to the experiment and expected remote before committing or pushing.

## Private remote gate

- exact GitHub owner and repository name
- authenticated account and destination authorization
- remote will be created private
- clean committed local repository root with no pre-existing `origin`
- remote default branch and commit SHA must match the pushed local branch and HEAD
- complete secret/coverage scan of exactly the tracked Git tree; ignored local dependencies are not pushed and are not scanned as repository content
- meaningful verified work, not artificial activity
- license and upstream attribution preserved
- explicit request or durable policy for the private external mutation

```bash
auto-tinker repo create-private <experiment-id> --workspace /absolute/workspace --json --dry-run
auto-tinker repo create-private <experiment-id> --workspace /absolute/workspace --json --owner <github-owner>
```

## Public visibility gate

- private remote exists and its identity is verified
- clean local origin, branch, and HEAD exactly match the recorded private destination and reviewed SHA
- code and changelog evidence were inspected
- README review is `approved`
- public-story review is `approved` when a public story is part of the release
- truthful attribution names the source, URL, pinned revision, license, and the user's exact delta for adapted work
- license review is `compatible` or `approved`
- writing voice comes from approved examples or the plain first-person fallback, not inferred private text
- tests still match the commit being published
- no confidential content, secrets, personal data, or unsupported authorship claims
- license permits the distribution model
- repository-publication consent is independently present as `repository_publication_approval: approved`, explicit approval in the current publish chat, or durable `auto_public: true`

Record writing and experiment gates separately:

```bash
auto-tinker journal review <readme-journal-id> --workspace /absolute/workspace --json --state approved
auto-tinker journal review <public-story-id> --workspace /absolute/workspace --json --state approved
auto-tinker experiment update <experiment-id> --workspace /absolute/workspace --json \
  --readme-review approved --public-story-review approved \
  --attribution "Adapted from <project> at <url>@<revision> under <license>; delta: <change>." \
  --license-review compatible
auto-tinker experiment update <experiment-id> --workspace /absolute/workspace --json \
  --repository-publication-approval approved
```

`journal review` and the first `experiment update` review writing and release materials. Only the second `experiment update`, explicit approval supplied to the publish command, or durable `auto_public` grants repository-publication consent. Never translate `writing_approval` into repository consent.

```bash
auto-tinker repo publish <experiment-id> --workspace /absolute/workspace --json --dry-run
auto-tinker repo publish <experiment-id> --workspace /absolute/workspace --json --approve
```

Use `--approve` only for clear repository-publication approval in the current chat. It grants consent only to that invocation and becomes recorded approval only after successful publication. When durable `repository_publication_approval` already exists, invoke without manufacturing a second approval flag and let the CLI enforce policy. Never add `--approve` merely to get past a failed writing, attribution, license, or policy gate.

## Approval is not visibility

The viewer may write local review/approval state but cannot invoke GitHub. After every publish command, verify the remote's actual visibility and record it separately. If repository-publication consent is absent, leave the remote private and generate a prompt with `auto-tinker prompt publish --target <experiment-id>`.

## Attribution patterns

For an adaptation, name the upstream project, URL, pinned revision, license, and the exact delta. Do not claim to have authored upstream work. For a from-scratch experiment inspired by sources, cite inspirations and explain the independently implemented concept.
