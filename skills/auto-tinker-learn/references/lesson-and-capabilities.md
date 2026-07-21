# Lessons and capability growth

## Lesson command

```bash
auto-tinker lesson create --workspace /absolute/workspace --json \
  --title "What replay-safe workflows actually require" \
  --summary "Context, mechanism, change, failures, verification, and transfer." \
  --experiment <experiment-id> \
  --capability "durable-workflows" \
  --capability "idempotency" \
  --tags "typescript,workflow,reliability"

auto-tinker journal append --workspace /absolute/workspace --json --kind private-journal \
  --title "Added replay-safe recovery" \
  --body "Outcome-focused dated narrative with test evidence." \
  --experiment <experiment-id> \
  --tags "workflow,reliability"
```

## Tutorial shape

1. Why this was selected for this user and goal
2. Minimal mental model and prerequisite bridge
3. Repository or design anatomy
4. Exact experiment and meaningful change
5. Important implementation walkthrough
6. Failures, surprises, and rejected approaches
7. Verification and limitations
8. How to reproduce or extend it
9. Adjacent next branches

## Evidence stages

- `exposed`: encountered and can describe the idea
- `applied`: used it in a bounded implementation
- `validated`: verified a nontrivial result against criteria
- `reused`: applied it successfully in another context
- `shipped`: delivered it to real users or an approved public/private destination

Advance only to the highest stage directly supported by linked evidence. Generated code without understanding is not capability evidence; a documented failure may still support `exposed` or `applied`.

Repository presence is not required. A chat transcript excerpt, design note, test snapshot, or user-supplied artifact can support a knowledge node when provenance and confidence are explicit. Mark repository location `missing` or `unverified` rather than manufacturing one.

## Learning paths

Build paths from current evidence to the chosen goal. Include prerequisites, estimated effort, branches, a practical experiment at each step, and what evidence would advance the capability. Avoid a single rigid curriculum when parallel routes fit different interests or time budgets.

## Writing artifact links

Link the lesson to applicable `journal append --kind` artifacts without conflating their audiences: candid `private-journal`, richer `readme`, concise dated `changelog`, and privacy-reviewed `public-story`. Only `readme` requires a repository.
