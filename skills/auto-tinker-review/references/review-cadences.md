# Review cadences

## Daily review

- outcomes and meaningful changes today
- experiments created, resumed, verified, failed, or blocked
- active main-goal contribution and accepted distractions
- lessons and evidence-backed capability movement
- private journal and dated changelog entries
- README and public-story review readiness as separate states
- repository-publication approval versus actual private/public remote visibility
- queue changes and tomorrow's eligible top items
- missing/unverified code locations and other evidence gaps

Daily reconciliation must be idempotent: rerunning it should not duplicate events or writing artifacts.

## Weekly review

- progress toward the main goal's outcome and success criteria
- supporting-goal progress and exploration-budget use
- coherent learning/work arcs rather than a commit count
- capabilities advanced, reused, or unsupported
- source and experiment diversity
- repeated failures or bottlenecks
- stale, duplicate, blocked, distracting, and low-value queue items
- privacy-reviewed public possibilities, never automatic publication
- profile or goal suggestions that still require acceptance

## Graph query

Run:

```bash
auto-tinker index --workspace /absolute/workspace --json
auto-tinker graph --workspace /absolute/workspace --json
```

Answer with exact node IDs and typed relationships. A repository URL is evidence only when verified. When absent, cite the chat/note/test snapshot that supports the node and mark the location limitation.

## Writing-artifact readiness

- `private-journal`: candid and private, completeness checked
- `readme`: repository-specific, reproducible, attribution checked
- `changelog`: dated and concise, deduplicated
- `public-story`: privacy and voice reviewed, still not publication authority

Change an individual artifact's writing state only when the user asks:

```bash
auto-tinker journal review <journal-id> --workspace /absolute/workspace --json --state approved
```

Report aggregate `readme_review`, `public_story_review`, truthful `attribution`, `license_review`, and `repository_publication_approval` independently. An approved journal or aggregate writing review is never consent to make a GitHub repository public.
