import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { mergeArtifactLocations } from "./artifacts";
import { slugify } from "./ids";
import { pathExists } from "./markdown";
import { currentDeviceId } from "./machine";
import { findPotentialSecrets, redactSecrets, scanPathForSecrets } from "./security";
import { readConfig, readRecord, updateRecord } from "./vault";
import {
  AutoTinkerError,
  type ArtifactLocation,
  type CanonicalRecord,
  type EvidenceSnapshot,
  type LinkedOutput,
  type RepoPlan,
} from "./types";

const execFileAsync = promisify(execFile);

function safeRepositoryPart(value: string, label: string): string {
  if (
    !/^[A-Za-z0-9_.-]{1,100}$/.test(value) ||
    value === "." ||
    value === ".." ||
    value.startsWith("-")
  ) {
    throw new AutoTinkerError("INVALID_REPOSITORY", `${label} contains unsafe characters: ${value}`);
  }
  return value;
}

export function canonicalGitHubRepository(value: string): string {
  const trimmed = value.trim();
  let parts: string[];
  if (/^git@github\.com:/i.test(trimmed)) {
    parts = trimmed.replace(/^git@github\.com:/i, "").replace(/\.git$/i, "").split("/");
  } else if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new AutoTinkerError("INVALID_REPOSITORY", "GitHub repository URL is invalid");
    }
    if (parsed.hostname.toLowerCase() !== "github.com" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new AutoTinkerError("INVALID_REPOSITORY", "Repository must be a canonical, credential-free github.com URL");
    }
    parts = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").split("/");
  } else {
    parts = trimmed.replace(/\.git$/i, "").split("/");
  }
  if (parts.length !== 2) throw new AutoTinkerError("INVALID_REPOSITORY", "GitHub target must be owner/repository");
  return `${safeRepositoryPart(parts[0], "Owner")}/${safeRepositoryPart(parts[1], "Repository name")}`;
}

function destinationGitHubLocation(experiment: CanonicalRecord): ArtifactLocation | undefined {
  const locations = Array.isArray(experiment.frontmatter.artifact_locations)
    ? (experiment.frontmatter.artifact_locations as ArtifactLocation[])
    : [];
  const explicitRepoUrl = typeof experiment.frontmatter.repo_url === "string"
    ? canonicalGitHubRepository(experiment.frontmatter.repo_url)
    : undefined;
  if (explicitRepoUrl) {
    return locations.find(
      (location) =>
        location.kind === "github" &&
        location.uri &&
        canonicalGitHubRepository(location.uri).toLowerCase() === explicitRepoUrl.toLowerCase(),
    ) ?? {
      kind: "github",
      availability: "unverified",
      repository_role: "destination",
      uri: `https://github.com/${explicitRepoUrl}`,
    };
  }
  return locations.find(
    (location) => location.kind === "github" && location.uri && location.repository_role === "destination",
  );
}

function sourceGitHubRepositories(experiment: CanonicalRecord): string[] {
  const locations = Array.isArray(experiment.frontmatter.artifact_locations)
    ? (experiment.frontmatter.artifact_locations as ArtifactLocation[])
    : [];
  const candidates = [
    experiment.frontmatter.source_repository,
    ...locations
      .filter((location) => location.kind === "github" && location.repository_role === "source")
      .map((location) => location.uri),
  ];
  const repositories = new Set<string>();
  for (const value of candidates) {
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        if (new URL(trimmed).hostname.toLowerCase() !== "github.com") continue;
      } catch {
        continue;
      }
    } else if (!/^git@github\.com:/i.test(trimmed) && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(trimmed)) {
      continue;
    }
    repositories.add(canonicalGitHubRepository(trimmed).toLowerCase());
  }
  return [...repositories];
}

function assertDistinctAdaptationDestination(experiment: CanonicalRecord, destination: string): void {
  const canonicalDestination = canonicalGitHubRepository(destination);
  if (sourceGitHubRepositories(experiment).includes(canonicalDestination.toLowerCase())) {
    throw new AutoTinkerError(
      "SOURCE_DESTINATION_COLLISION",
      `Adaptation destination ${canonicalDestination} is the upstream source; choose a separately owned repository`,
    );
  }
}

function assertUnambiguousImplicitDestination(
  experiment: CanonicalRecord,
  repositoryName: string,
  owner?: string,
  explicitDestination?: string,
): void {
  if (owner || explicitDestination) return;
  const matchesSourceName = sourceGitHubRepositories(experiment).some(
    (repository) => repository.split("/").at(-1)?.toLowerCase() === repositoryName.toLowerCase(),
  );
  if (matchesSourceName) {
    throw new AutoTinkerError(
      "SOURCE_DESTINATION_COLLISION",
      `Destination owner is unresolved and ${repositoryName} matches the upstream repository name; pass an explicit owner or choose a distinct repository name`,
    );
  }
}

async function assertConsistentLocalDestination(
  workspace: string,
  experiment: CanonicalRecord,
  plannedLocalPath: string,
): Promise<void> {
  const deviceId = await currentDeviceId(workspace);
  const locations = Array.isArray(experiment.frontmatter.artifact_locations)
    ? (experiment.frontmatter.artifact_locations as ArtifactLocation[])
    : [];
  const candidates = new Set(
    locations
      .filter(
        (location) =>
          location.kind === "local" &&
          location.availability === "present" &&
          location.device_id === deviceId &&
          location.repository_role !== "source" &&
          Boolean(location.path),
      )
      .map((location) => String(location.path)),
  );
  const legacyPath = typeof experiment.frontmatter.repo_path === "string"
    ? experiment.frontmatter.repo_path.trim()
    : "";
  if (legacyPath && await pathExists(path.resolve(workspace, legacyPath))) candidates.add(legacyPath);
  const planned = await realpath(plannedLocalPath).catch(() => path.resolve(plannedLocalPath));
  for (const candidate of candidates) {
    const resolved = path.resolve(workspace, candidate);
    const canonical = await realpath(resolved).catch(() => resolved);
    if (canonical !== planned) {
      throw new AutoTinkerError(
        "REPOSITORY_LOCATION_MISMATCH",
        `Recorded local destination ${candidate} does not match the planned checkout ${path.relative(workspace, plannedLocalPath)}`,
      );
    }
  }
}

function scanFailureSummary(scan: Awaited<ReturnType<typeof scanPathForSecrets>>): string[] {
  return [
    ...scan.findings.map((finding) => `${finding.path} (${finding.kinds.join(",")})`),
    ...scan.skipped_details.map((skipped) =>
      `${skipped.path} skipped:${skipped.reason}${skipped.size_bytes !== undefined ? `:${skipped.size_bytes}B` : ""}`,
    ),
    ...(scan.skipped_files > scan.skipped_details.length
      ? [`${scan.skipped_files - scan.skipped_details.length} additional skipped files`]
      : []),
  ];
}

async function scanPublishablePathForSecrets(localPath: string): Promise<Awaited<ReturnType<typeof scanPathForSecrets>>> {
  if (!(await pathExists(path.join(localPath, ".git")))) {
    return scanPathForSecrets(localPath, { ignoredDirectories: [".git"] });
  }
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("git", ["ls-tree", "-r", "-z", "--full-tree", "HEAD"], {
      cwd: localPath,
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
      env: process.env,
    }));
  } catch {
    return {
      ok: false,
      scanned_files: 0,
      skipped_files: 1,
      skipped_details: [{ path: ".", reason: "unreadable" }],
      findings: [],
    };
  }
  const files: string[] = [];
  const unsupported: Array<{ path: string; reason: "unsupported" }> = [];
  for (const entry of stdout.split("\0").filter(Boolean)) {
    const match = entry.match(/^\d+ ([^ ]+) [0-9a-f]+\t([\s\S]+)$/i);
    if (!match || match[1] !== "blob") {
      unsupported.push({ path: match?.[2] ?? "unknown-tree-entry", reason: "unsupported" });
      continue;
    }
    files.push(match[2]);
  }
  const scan = await scanPathForSecrets(localPath, { includedFiles: files, ignoredDirectories: [] });
  const skippedDetails = [...scan.skipped_details, ...unsupported].slice(0, 100);
  const skippedFiles = scan.skipped_files + unsupported.length;
  return { ...scan, ok: scan.findings.length === 0 && skippedFiles === 0, skipped_files: skippedFiles, skipped_details: skippedDetails };
}

async function assertCompleteRepositoryScan(localPath: string, code: string): Promise<void> {
  const scan = await scanPublishablePathForSecrets(localPath);
  if (!scan.ok) {
    throw new AutoTinkerError(
      code,
      `Repository scan failed closed: ${scan.findings.length} secret-bearing files; ${scan.skipped_files} skipped files`,
      {
        scanned_files: scan.scanned_files,
        skipped_files: scan.skipped_files,
        failures: scanFailureSummary(scan).slice(0, 100),
      },
    );
  }
}

async function linkedOutputRecords(workspace: string, experiment: CanonicalRecord): Promise<Map<LinkedOutput["kind"], CanonicalRecord>> {
  const outputs = Array.isArray(experiment.frontmatter.linked_outputs)
    ? (experiment.frontmatter.linked_outputs as LinkedOutput[])
    : [];
  const result = new Map<LinkedOutput["kind"], CanonicalRecord>();
  for (const output of outputs) {
    if (!output.record_id) continue;
    try {
      result.set(output.kind, await readRecord(workspace, output.record_id));
    } catch {
      // A broken link is a failed readiness gate, represented by absence.
    }
  }
  return result;
}

function hasPassingEvidenceForRevision(experiment: CanonicalRecord, revision: string | undefined): boolean {
  if (!revision) return false;
  const evidence = Array.isArray(experiment.frontmatter.evidence)
    ? (experiment.frontmatter.evidence as EvidenceSnapshot[])
    : [];
  return evidence.some(
    (item) =>
      (item.kind === "test" || item.kind === "build") &&
      item.status === "pass" &&
      item.revision?.toLowerCase() === revision.toLowerCase(),
  );
}

async function publicationReadiness(
  workspace: string,
  experiment: CanonicalRecord,
  autoPublic: boolean,
  inferredLocalPath: string,
): Promise<Array<{ gate: string; passed: boolean; message: string }>> {
  const outputs = await linkedOutputRecords(workspace, experiment);
  const destination = destinationGitHubLocation(experiment);
  const remoteHead = typeof experiment.frontmatter.remote_head_sha === "string"
    ? experiment.frontmatter.remote_head_sha.toLowerCase()
    : "";
  const remoteBranch = typeof experiment.frontmatter.remote_default_branch === "string"
    ? experiment.frontmatter.remote_default_branch.trim()
    : "";
  const verifiedPrivateRemote =
    experiment.frontmatter.remote_visibility === "private" &&
    Boolean(remoteBranch) &&
    /^[0-9a-f]{40,64}$/i.test(remoteHead) &&
    typeof destination?.revision === "string" &&
    destination.revision.toLowerCase() === remoteHead;
  const reviewedRevision = verifiedPrivateRemote ? remoteHead : undefined;
  const passingEvidence = hasPassingEvidenceForRevision(experiment, reviewedRevision);
  const readme = outputs.get("readme");
  const readmeReviewed =
    experiment.frontmatter.readme_review === "approved" || readme?.frontmatter.writing_approval === "approved";
  const readmeReady = Boolean(readme?.body.trim()) && readmeReviewed;
  const story = outputs.get("public-story");
  const storyReviewed =
    experiment.frontmatter.public_story_review === "approved" || story?.frontmatter.writing_approval === "approved";
  const storyReady = Boolean(story?.body.trim()) && (autoPublic ? ["review", "ready"].includes(story?.frontmatter.status ?? "") || storyReviewed : storyReviewed);
  const adaptation = experiment.frontmatter.mode === "adapt" || Boolean(experiment.frontmatter.source_repository);
  const attributionReady = !adaptation || Boolean(String(experiment.frontmatter.attribution ?? "").trim());
  const licenseReview = String(experiment.frontmatter.license_review ?? "pending");
  const licenseReady = !adaptation || ["compatible", "approved"].includes(licenseReview);

  const stringsToScan = [
    experiment.body,
    JSON.stringify(experiment.frontmatter),
    ...[...outputs.values()].flatMap((output) => [output.body, JSON.stringify(output.frontmatter)]),
  ];
  const vaultSecretKinds = new Set(stringsToScan.flatMap((value) => findPotentialSecrets(value).map((finding) => finding.kind)));
  const locationFailures: string[] = [];
  const codeSecretFindings: string[] = [];
  const scanCoverageFailures: string[] = [];
  const deviceId = await currentDeviceId(workspace);
  const locations = Array.isArray(experiment.frontmatter.artifact_locations)
    ? (experiment.frontmatter.artifact_locations as ArtifactLocation[])
    : [];
  const scannedTargets = new Set<string>();
  let localCheckoutVerified = false;
  let localCheckoutMessage = "The planned checkout must be a clean Git repository matching the reviewed destination, branch, and SHA";
  const scanTarget = async (target: string, label: string): Promise<void> => {
    const resolved = path.resolve(target);
    if (scannedTargets.has(resolved)) return;
    scannedTargets.add(resolved);
    const scan = await scanPublishablePathForSecrets(resolved);
    codeSecretFindings.push(...scan.findings.map((finding) => `${finding.path} (${finding.kinds.join(",")})`));
    if (scan.skipped_files) {
      scanCoverageFailures.push(
        `${scan.skipped_files} files skipped under ${label}: ${scanFailureSummary(scan).slice(0, 10).join("; ")}`,
      );
    }
  };
  for (const location of locations) {
    if (location.kind !== "local" || location.availability !== "present") continue;
    if (location.repository_role === "source") continue;
    if (location.device_id !== deviceId) {
      locationFailures.push("a local path is marked present for another or unknown device");
      continue;
    }
    if (!location.path) {
      locationFailures.push("a present local location has no path");
      continue;
    }
    const target = path.resolve(workspace, location.path);
    const relative = path.relative(path.resolve(workspace), target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      locationFailures.push("a local artifact path is outside the Auto-Tinker workspace");
      continue;
    }
    if (!(await pathExists(target))) {
      locationFailures.push("a local artifact marked present is missing on this device");
      continue;
    }
    await scanTarget(target, location.path);
  }
  if (!(await pathExists(inferredLocalPath))) {
    locationFailures.push("the planned local checkout is missing on this device");
  } else if (!(await pathExists(path.join(inferredLocalPath, ".git")))) {
    locationFailures.push("the planned local checkout is not a Git repository");
  } else {
    await scanTarget(inferredLocalPath, path.relative(path.resolve(workspace), inferredLocalPath));
    if (verifiedPrivateRemote && destination?.uri) {
      try {
        const local = await localRepositoryHead(inferredLocalPath, { requireNoOrigin: false });
        const originMatches = Boolean(
          local.origin &&
          canonicalGitHubRepository(local.origin).toLowerCase() === canonicalGitHubRepository(destination.uri).toLowerCase(),
        );
        localCheckoutVerified = originMatches && local.branch === remoteBranch && local.sha === remoteHead;
        if (localCheckoutVerified) {
          localCheckoutMessage = `Clean local checkout matches ${remoteBranch}@${remoteHead}`;
        }
      } catch {
        localCheckoutVerified = false;
      }
    }
  }
  const secretsClean =
    vaultSecretKinds.size === 0 &&
    codeSecretFindings.length === 0 &&
    locationFailures.length === 0 &&
    scanCoverageFailures.length === 0;

  return [
    { gate: "experiment-complete", passed: experiment.frontmatter.status === "complete", message: experiment.frontmatter.status === "complete" ? "Experiment is complete" : "Experiment must be completed first" },
    {
      gate: "private-remote-verified",
      passed: verifiedPrivateRemote,
      message: verifiedPrivateRemote
        ? `Private destination ${remoteBranch}@${remoteHead} is recorded for review`
        : "Record a verified private destination, default branch, and exact remote SHA before publication review",
    },
    { gate: "local-checkout-verified", passed: localCheckoutVerified, message: localCheckoutMessage },
    {
      gate: "passing-evidence",
      passed: passingEvidence,
      message: passingEvidence
        ? `Passing test/build evidence is bound to reviewed revision ${reviewedRevision}`
        : reviewedRevision
          ? `Add passing test/build evidence with revision ${reviewedRevision}`
          : "Record the reviewed remote commit SHA and bind passing test/build evidence to it",
    },
    { gate: "readme-ready", passed: readmeReady, message: readmeReady ? "README narrative exists and is approved" : "Create a linked README narrative and approve its review" },
    { gate: "public-story-ready", passed: storyReady, message: storyReady ? (autoPublic && !storyReviewed ? "Public story is ready under durable auto_public policy" : "Public story exists and is reviewed") : "Create a linked public story and approve its review" },
    { gate: "attribution", passed: attributionReady, message: attributionReady ? "Attribution requirement satisfied" : "Adaptations require explicit source attribution" },
    { gate: "license-review", passed: licenseReady, message: licenseReady ? "License review is compatible" : "Adaptations require a compatible or approved license review" },
    {
      gate: "secret-scan",
      passed: secretsClean,
      message: secretsClean
        ? "No known secrets found in publishable records or present local artifacts"
        : `Secret/location scan failed: ${[
            ...[...vaultSecretKinds].map((kind) => `vault:${kind}`),
            ...codeSecretFindings.slice(0, 10),
            ...locationFailures,
            ...scanCoverageFailures,
          ].join("; ")}`,
    },
  ];
}

export async function buildRepoPlan(workspace: string, experimentId: string, owner?: string): Promise<RepoPlan> {
  const [experiment, config] = await Promise.all([readRecord(workspace, experimentId), readConfig(workspace)]);
  if (experiment.frontmatter.type !== "experiment") throw new AutoTinkerError("WRONG_RECORD_TYPE", `${experimentId} is not an experiment`);
  const mode = experiment.frontmatter.mode === "adapt" ? "adapt" : "scratch";
  const repositoryName = safeRepositoryPart(
    String(experiment.frontmatter.repo_name || slugify(experiment.frontmatter.title, "auto-tinker-experiment")),
    "Repository name",
  );
  const ownerPart = owner ? safeRepositoryPart(owner, "Owner") : undefined;
  const fullName = ownerPart ? `${ownerPart}/${repositoryName}` : repositoryName;
  const localPath = path.join(path.resolve(workspace), "tinkers", repositoryName);
  await assertConsistentLocalDestination(workspace, experiment, localPath);
  const approval = experiment.frontmatter.repository_publication_approval === "approved";
  const autoPublic = config.frontmatter.auto_public === true;
  const consent = autoPublic || approval;
  const readiness = await publicationReadiness(workspace, experiment, autoPublic, localPath);
  const ready = readiness.every((gate) => gate.passed);
  const publicationAllowed = consent && ready;
  const storyReviewed = experiment.frontmatter.public_story_review === "approved";
  const remoteValue = destinationGitHubLocation(experiment)?.uri;
  assertUnambiguousImplicitDestination(experiment, repositoryName, ownerPart, remoteValue);
  const remote = typeof remoteValue === "string" ? canonicalGitHubRepository(remoteValue) : fullName;
  if (typeof remoteValue === "string") {
    const [recordedOwner, recordedName] = remote.split("/");
    if (
      recordedName.toLowerCase() !== repositoryName.toLowerCase() ||
      (ownerPart && recordedOwner.toLowerCase() !== ownerPart.toLowerCase())
    ) {
      throw new AutoTinkerError(
        "REPOSITORY_DESTINATION_MISMATCH",
        `Recorded destination ${remote} does not match the planned private repository ${fullName}`,
      );
    }
  }
  if (typeof remoteValue === "string" || ownerPart) assertDistinctAdaptationDestination(experiment, remote);
  const failures = readiness.filter((gate) => !gate.passed).map((gate) => gate.gate);
  return {
    experiment_id: experimentId,
    mode,
    repository_name: repositoryName,
    local_path: localPath,
    experiment_record_privacy: experiment.frontmatter.privacy,
    creation_visibility: "private",
    remote_visibility: experiment.frontmatter.remote_visibility === "public" ? "public" : "private",
    ...(experiment.frontmatter.source_repository ? { source_repository: String(experiment.frontmatter.source_repository) } : {}),
    attribution_required: mode === "adapt" || Boolean(experiment.frontmatter.source_repository),
    publication: {
      allowed: publicationAllowed,
      reason: !consent
        ? "Awaiting repository publication approval"
        : failures.length
          ? `Readiness gates failed: ${failures.join(", ")}`
          : autoPublic
            ? "Durable auto_public consent and all readiness gates passed"
            : "Explicit repository publication approval and all readiness gates passed",
      auto_public: autoPublic,
      reviewed: storyReviewed,
      consent,
      readiness,
    },
    commands: [
      ["gh", "repo", "create", remote, "--private", "--source", localPath, "--remote", "origin", "--push"],
      ["gh", "repo", "edit", remote, "--visibility", "public", "--accept-visibility-change-consequences"],
    ],
  };
}

async function runGh(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync("gh", args, { cwd, timeout: 60_000, maxBuffer: 1024 * 1024, env: process.env });
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : String(error));
    throw new AutoTinkerError("GITHUB_COMMAND_FAILED", `GitHub CLI command failed: gh ${args.join(" ")}`, { message });
  }
}

type GitHubCommandRunner = (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string }>;

async function localRepositoryHead(
  localPath: string,
  options: { requireNoOrigin?: boolean } = {},
): Promise<{ branch: string; sha: string; origin?: string }> {
  if (!(await pathExists(localPath)) || !(await pathExists(path.join(localPath, ".git")))) {
    throw new AutoTinkerError(
      "LOCAL_REPOSITORY_REQUIRED",
      `Private remote creation requires an existing local Git repository at ${localPath}`,
    );
  }
  const git = async (args: string[], code: string, message: string): Promise<string> => {
    try {
      const result = await execFileAsync("git", args, {
        cwd: localPath,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        env: process.env,
      });
      return result.stdout.trim();
    } catch (error) {
      throw new AutoTinkerError(code, message, {
        message: redactSecrets(error instanceof Error ? error.message : String(error)),
      });
    }
  };
  const topLevel = await git(["rev-parse", "--show-toplevel"], "LOCAL_REPOSITORY_INVALID", "The local source is not a readable Git repository");
  if ((await realpath(topLevel).catch(() => path.resolve(topLevel))) !== (await realpath(localPath).catch(() => path.resolve(localPath)))) {
    throw new AutoTinkerError("LOCAL_REPOSITORY_INVALID", "The planned local path must be the Git repository root");
  }
  const branch = await git(["symbolic-ref", "--quiet", "--short", "HEAD"], "LOCAL_REPOSITORY_DETACHED", "Private remote creation requires a named local branch");
  const sha = await git(["rev-parse", "HEAD"], "LOCAL_REPOSITORY_HAS_NO_COMMIT", "Commit the local experiment before creating its remote");
  if (!/^[0-9a-f]{40,64}$/i.test(sha)) {
    throw new AutoTinkerError("LOCAL_REPOSITORY_HAS_NO_COMMIT", "The local repository HEAD is not a valid commit");
  }
  const status = await git(["status", "--porcelain", "--untracked-files=all"], "LOCAL_REPOSITORY_INVALID", "Could not inspect the local working tree");
  if (status) {
    throw new AutoTinkerError("LOCAL_REPOSITORY_DIRTY", "Commit or remove every local change before creating and pushing the private remote");
  }
  const remotes = (await git(["remote"], "LOCAL_REPOSITORY_INVALID", "Could not inspect local Git remotes")).split(/\r?\n/).filter(Boolean);
  if (options.requireNoOrigin !== false && remotes.includes("origin")) {
    throw new AutoTinkerError(
      "ORIGIN_ALREADY_EXISTS",
      "The local repository already has an origin remote; verify or rename it before private repository creation",
    );
  }
  const origin = remotes.includes("origin")
    ? await git(["remote", "get-url", "origin"], "LOCAL_REPOSITORY_INVALID", "Could not inspect the origin remote")
    : undefined;
  return { branch, sha: sha.toLowerCase(), ...(origin ? { origin } : {}) };
}

function verifiedGitHubView<T extends "PRIVATE" | "PUBLIC">(stdout: string, expectedVisibility: T): {
  name: string;
  url: string;
  visibility: T;
  default_branch?: string;
} {
  let parsed: { nameWithOwner?: string; url?: string; visibility?: string; defaultBranchRef?: { name?: string } };
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    throw new AutoTinkerError("REPOSITORY_VERIFICATION_FAILED", "GitHub returned invalid verification JSON");
  }
  if (!parsed.nameWithOwner || !parsed.url || parsed.visibility !== expectedVisibility) {
    throw new AutoTinkerError(
      "REPOSITORY_VERIFICATION_FAILED",
      `GitHub visibility verification failed; expected ${expectedVisibility} and a canonical repository identity`,
    );
  }
  const name = canonicalGitHubRepository(parsed.nameWithOwner);
  if (canonicalGitHubRepository(parsed.url) !== name) {
    throw new AutoTinkerError("REPOSITORY_VERIFICATION_FAILED", "GitHub URL and repository identity do not match");
  }
  return {
    name,
    url: `https://github.com/${name}`,
    visibility: expectedVisibility,
    ...(parsed.defaultBranchRef?.name ? { default_branch: parsed.defaultBranchRef.name } : {}),
  };
}

async function verifyRemoteState<T extends "PRIVATE" | "PUBLIC">(
  githubRunner: GitHubCommandRunner,
  cwd: string,
  remote: string,
  expectedVisibility: T,
  expectedBranch: string,
  expectedSha: string,
): Promise<{ name: string; url: string; visibility: T; default_branch: string; head_sha: string }> {
  const canonicalRemote = canonicalGitHubRepository(remote);
  const view = await githubRunner(
    ["repo", "view", canonicalRemote, "--json", "nameWithOwner,url,visibility,defaultBranchRef"],
    cwd,
  );
  const identity = verifiedGitHubView(view.stdout, expectedVisibility);
  if (identity.name.toLowerCase() !== canonicalRemote.toLowerCase()) {
    throw new AutoTinkerError(
      "REPOSITORY_VERIFICATION_FAILED",
      `GitHub returned ${identity.name}, expected exact destination ${canonicalRemote}`,
    );
  }
  if (!identity.default_branch || identity.default_branch !== expectedBranch) {
    throw new AutoTinkerError(
      "REPOSITORY_VERIFICATION_FAILED",
      `Remote default branch ${identity.default_branch ?? "is missing"}; expected ${expectedBranch}`,
    );
  }
  const remoteHead = (
    await githubRunner(
      ["api", `repos/${identity.name}/commits/${encodeURIComponent(identity.default_branch)}`, "--jq", ".sha"],
      cwd,
    )
  ).stdout.trim().toLowerCase();
  if (!/^[0-9a-f]{40,64}$/i.test(remoteHead) || remoteHead !== expectedSha.toLowerCase()) {
    throw new AutoTinkerError(
      "REPOSITORY_VERIFICATION_FAILED",
      `Remote default-branch SHA ${remoteHead || "is missing"}; expected ${expectedSha.toLowerCase()}`,
    );
  }
  return {
    name: identity.name,
    url: identity.url,
    visibility: expectedVisibility,
    default_branch: identity.default_branch,
    head_sha: remoteHead,
  };
}

export async function createPrivateRepository(
  workspace: string,
  experimentId: string,
  options: { owner?: string; dryRun?: boolean; githubRunner?: GitHubCommandRunner } = {},
): Promise<{
  plan: RepoPlan;
  executed: boolean;
  local?: { branch: string; sha: string };
  repository?: { name: string; url: string; visibility: "PRIVATE"; default_branch: string; head_sha: string };
}> {
  const plan = await buildRepoPlan(workspace, experimentId, options.owner);
  const local = await localRepositoryHead(plan.local_path);
  await assertCompleteRepositoryScan(plan.local_path, "PRIVATE_REPOSITORY_SCAN_FAILED");
  if (options.dryRun) return { plan, executed: false, local: { branch: local.branch, sha: local.sha } };
  const githubRunner = options.githubRunner ?? runGh;
  const experimentBeforeCreate = await readRecord(workspace, experimentId);
  const recordedDestination = destinationGitHubLocation(experimentBeforeCreate)?.uri;
  const fullName = recordedDestination
    ? canonicalGitHubRepository(recordedDestination)
    : `${
      options.owner
        ? safeRepositoryPart(options.owner, "Owner")
        : safeRepositoryPart((await githubRunner(["api", "user", "--jq", ".login"], workspace)).stdout.trim(), "Authenticated owner")
    }/${plan.repository_name}`;
  const plannedTarget = plan.commands[0][3];
  const targetMatches = plannedTarget.includes("/")
    ? fullName.toLowerCase() === plannedTarget.toLowerCase()
    : fullName.split("/").at(-1)?.toLowerCase() === plannedTarget.toLowerCase();
  if (!targetMatches) {
    throw new AutoTinkerError(
      "REPOSITORY_DESTINATION_MISMATCH",
      "The private repository destination changed after planning",
    );
  }
  assertDistinctAdaptationDestination(experimentBeforeCreate, fullName);
  await githubRunner(
    ["repo", "create", fullName, "--private", "--source", plan.local_path, "--remote", "origin", "--push"],
    workspace,
  );
  const verified = await verifyRemoteState(
    githubRunner,
    workspace,
    fullName,
    "PRIVATE",
    local.branch,
    local.sha,
  );
  const experiment = await readRecord(workspace, experimentId);
  const locations = mergeArtifactLocations(experiment.frontmatter.artifact_locations as ArtifactLocation[] | undefined, [
    { kind: "github", availability: "present", repository_role: "destination", uri: verified.url, revision: verified.head_sha, last_seen: new Date().toISOString() },
  ]);
  await updateRecord(workspace, experimentId, {
    status: experiment.frontmatter.status === "planned" ? "ready" : experiment.frontmatter.status,
    privacy: "private",
    metadata: {
      repo_url: verified.url,
      artifact_locations: locations,
      remote_visibility: "private",
      remote_default_branch: verified.default_branch,
      remote_head_sha: verified.head_sha,
    },
  });
  return { plan, executed: true, repository: verified };
}

export async function publishRepository(
  workspace: string,
  experimentId: string,
  options: { approve?: boolean; dryRun?: boolean; githubRunner?: GitHubCommandRunner } = {},
): Promise<{
  plan: RepoPlan;
  executed: boolean;
  remote?: { name: string; url: string; visibility: "PRIVATE"; default_branch: string; head_sha: string };
  repository?: { name: string; url: string; visibility: "PUBLIC"; default_branch: string; head_sha: string };
}> {
  let plan = await buildRepoPlan(workspace, experimentId);
  if (options.approve) {
    const readinessPasses = plan.publication.readiness.every((gate) => gate.passed);
    const failures = plan.publication.readiness.filter((gate) => !gate.passed).map((gate) => gate.gate);
    plan = {
      ...plan,
      publication: {
        ...plan.publication,
        consent: true,
        allowed: readinessPasses,
        reason: readinessPasses
          ? "Explicit current-run consent supplied; all readiness gates passed"
          : `Readiness gates failed: ${failures.join(", ")}`,
      },
    };
  }
  if (!plan.publication.consent) {
    throw new AutoTinkerError(
      "PUBLICATION_NOT_APPROVED",
      "Repository remains private. Approve repository publication or enable durable auto_public.",
    );
  }
  if (!plan.publication.allowed) {
    throw new AutoTinkerError("PUBLICATION_NOT_READY", plan.publication.reason, {
      failed_gates: plan.publication.readiness.filter((gate) => !gate.passed),
    });
  }
  const experiment = await readRecord(workspace, experimentId);
  const location = destinationGitHubLocation(experiment);
  const remoteValue = location?.uri;
  if (typeof remoteValue !== "string") {
    throw new AutoTinkerError("REPOSITORY_LOCATION_UNKNOWN", "No GitHub repository location is recorded for this experiment");
  }
  const remote = canonicalGitHubRepository(remoteValue);
  assertDistinctAdaptationDestination(experiment, remote);
  const expectedBranch = typeof experiment.frontmatter.remote_default_branch === "string"
    ? experiment.frontmatter.remote_default_branch
    : "";
  const expectedSha = typeof experiment.frontmatter.remote_head_sha === "string"
    ? experiment.frontmatter.remote_head_sha.toLowerCase()
    : "";
  if (!expectedBranch || !/^[0-9a-f]{40,64}$/i.test(expectedSha)) {
    throw new AutoTinkerError(
      "PUBLICATION_REVISION_UNKNOWN",
      "Publishing requires the recorded private remote default branch and reviewed commit SHA",
    );
  }
  if (location?.revision && location.revision.toLowerCase() !== expectedSha) {
    throw new AutoTinkerError(
      "PUBLICATION_REVISION_MISMATCH",
      `Destination location revision ${location.revision} does not match reviewed SHA ${expectedSha}`,
    );
  }
  const local = await localRepositoryHead(plan.local_path, { requireNoOrigin: false });
  if (!local.origin || canonicalGitHubRepository(local.origin).toLowerCase() !== remote.toLowerCase()) {
    throw new AutoTinkerError(
      "PUBLICATION_DESTINATION_MISMATCH",
      "The local origin does not match the exact reviewed GitHub destination",
    );
  }
  if (local.branch !== expectedBranch || local.sha !== expectedSha) {
    throw new AutoTinkerError(
      "PUBLICATION_REVISION_MISMATCH",
      `Local ${local.branch}@${local.sha} does not match reviewed ${expectedBranch}@${expectedSha}`,
    );
  }
  await assertCompleteRepositoryScan(plan.local_path, "PUBLICATION_SCAN_FAILED");
  if (!hasPassingEvidenceForRevision(experiment, expectedSha)) {
    throw new AutoTinkerError(
      "PUBLICATION_EVIDENCE_MISMATCH",
      `Passing test or build evidence must be explicitly bound to reviewed revision ${expectedSha}`,
    );
  }
  const githubRunner = options.githubRunner ?? runGh;
  if (options.dryRun) {
    const verified = await verifyRemoteState(githubRunner, workspace, remote, "PRIVATE", expectedBranch, expectedSha);
    return { plan, executed: false, remote: verified };
  }
  const [latestExperiment, latestConfig] = await Promise.all([
    readRecord(workspace, experimentId),
    readConfig(workspace),
  ]);
  assertDistinctAdaptationDestination(latestExperiment, remote);
  const latestDestination = destinationGitHubLocation(latestExperiment);
  const latestReadiness = await publicationReadiness(
    workspace,
    latestExperiment,
    latestConfig.frontmatter.auto_public === true,
    plan.local_path,
  );
  const latestConsent =
    options.approve === true ||
    latestConfig.frontmatter.auto_public === true ||
    latestExperiment.frontmatter.repository_publication_approval === "approved";
  if (
    !latestDestination?.uri ||
    canonicalGitHubRepository(latestDestination.uri).toLowerCase() !== remote.toLowerCase() ||
    String(latestExperiment.frontmatter.remote_default_branch ?? "") !== expectedBranch ||
    String(latestExperiment.frontmatter.remote_head_sha ?? "").toLowerCase() !== expectedSha ||
    !hasPassingEvidenceForRevision(latestExperiment, expectedSha) ||
    !latestConsent ||
    latestReadiness.some((gate) => !gate.passed)
  ) {
    throw new AutoTinkerError(
      "PUBLICATION_STATE_CHANGED",
      "The reviewed destination, revision, or passing evidence changed immediately before publication",
    );
  }
  await verifyRemoteState(githubRunner, workspace, remote, "PRIVATE", expectedBranch, expectedSha);
  await githubRunner(
    ["repo", "edit", remote, "--visibility", "public", "--accept-visibility-change-consequences"],
    workspace,
  );
  const verified = await verifyRemoteState(
    githubRunner,
    workspace,
    remote,
    "PUBLIC",
    expectedBranch,
    expectedSha,
  );
  const locations = mergeArtifactLocations(
    latestExperiment.frontmatter.artifact_locations as ArtifactLocation[] | undefined,
    [{
      kind: "github",
      availability: "present",
      repository_role: "destination",
      uri: verified.url,
      revision: verified.head_sha,
      last_seen: new Date().toISOString(),
    }],
  );
  await updateRecord(workspace, experimentId, {
    privacy: "public",
    metadata: {
      artifact_locations: locations,
      remote_visibility: "public",
      remote_default_branch: verified.default_branch,
      remote_head_sha: verified.head_sha,
      published_at: new Date().toISOString(),
      repository_publication_approval: "approved",
    },
  });
  return { plan, executed: true, repository: verified };
}
