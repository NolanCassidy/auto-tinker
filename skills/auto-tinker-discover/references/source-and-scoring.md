# Discovery sources and scoring

## Source families

- GitHub/GitLab trending, topic and repository search, releases, issues, and maintainer activity
- language package registries and recently updated packages
- curated maintainer and `awesome-*` lists
- Hacker News, Lobsters, engineering blogs, RSS, newsletters, and conference feeds
- arXiv, Papers with Code, Hugging Face, and research-lab publications
- security advisories for defensive experiments
- target-company engineering posts, job descriptions, and technology radars
- the user's unfinished repositories, stars, TODOs, repeated failures, capability gaps, and trusted people

Persist source provenance in candidate URLs/tags/notes; never collapse multiple source claims into an uncited popularity score.

## Catalog commands

```bash
auto-tinker source add --workspace /absolute/workspace --json \
  --title "GitHub local-first search" \
  --kind github-search \
  --url "https://github.com/search?q=topic%3Alocal-first&type=repositories" \
  --topics "local-first,agents" \
  --languages "TypeScript,Rust" \
  --cadence daily \
  --weight 1.3 \
  --techniques "sort by recently updated,compare releases and issue activity" \
  --strengths "dated maintenance evidence,license metadata" \
  --rate-limit-notes "Use authenticated search sparingly; retain the retrieval date." \
  --trust-notes "Primary repository metadata; verify external popularity claims." \
  --retrieved-at 2026-07-21

auto-tinker source update <source-id> --workspace /absolute/workspace --json \
  --weight 0.8 --cadence weekly \
  --techniques "topic query plus language filter,check releases before stars"

auto-tinker source list --workspace /absolute/workspace --json --enabled true
```

Weights are bounded from 0 to 2, where 1 is neutral. They express a user-owned prior, not truth. Techniques are repeatable query patterns, not free-form conclusions. Store credential-free web URLs only; put no API keys or signed feed URLs in Markdown.

A source locator is canonical, unique, and immutable because it defines the source record's stable identity and cross-device merge key. Query parameters are normalized for comparison. To point at a different URL or local alias, add a new source and disable the old record instead of editing its locator.

Local/user-owned discovery inputs use `local-*` kinds and a safe alias instead of a machine path:

```bash
auto-tinker source add --workspace /absolute/workspace --json \
  --title "Codex work history" --kind local-history \
  --locator local://codex-history --cadence daily --weight 1.2 \
  --techniques "reconcile stable source IDs,inspect bounded Git and task summaries"
```

Only `local:<alias>` or `local://<alias>` is accepted for local kinds. Never persist an absolute path, `file://` URI, hostname, account name, credential, or traversal segment. The alias identifies a source family across devices; source availability is inspected at run time.

## Candidate commands

```bash
auto-tinker candidate add --workspace /absolute/workspace --json \
  --title "Local semantic code explorer" \
  --summary "Build and verify a bounded local experiment." \
  --source "https://primary.example/item" \
  --why "Advances the indexed-search goal on this machine." \
  --tags "search,typescript,local-first" \
  --language "TypeScript" \
  --repo-url "https://github.com/example/project" \
  --goal-contribution "Builds evidence toward the active local-first tooling goal." \
  --distraction-risk "Uses one exploration slot and does not advance the target-role criterion." \
  --score 76

auto-tinker candidate evaluate <candidate-id> --workspace /absolute/workspace --json \
  --score 76 --fit 85 --novelty 70 --feasibility 82 --impact 68 \
  --goal-contribution "Validates a required capability for the main goal." \
  --distraction-risk "Moderate setup cost may crowd out the scheduled milestone." \
  --recommendation "Run a 60-minute attributed adaptation." \
  --notes "License, machine fit, risks, experiment, and dated evidence."
```

## Explainable score

Assess main-goal contribution, distraction risk, profile/interest fit, learning novelty, prerequisite fit, machine/time feasibility, expected impact, source health, trust/license risk, and recent variety. Manual queue rank later overrides this score.

Every stored candidate should say:

- what the source is and why it matters now;
- what the user would learn;
- the exact experiment and success test;
- estimated time and prerequisites;
- machine fit and risks;
- license/attribution obligations;
- why it is not a duplicate;
- primary source URLs and retrieval dates.

Run untrusted code only later in an approved sandbox.
