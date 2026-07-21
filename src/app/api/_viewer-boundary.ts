import os from "node:os";
import path from "node:path";
import type { WorkspacePaths } from "@/lib/auto-tinker/types";

function isUnsafeWorkspaceRoot(candidate: string, homeDirectory: string) {
  const resolved = path.resolve(candidate);
  const root = path.parse(resolved).root;
  return resolved === root || resolved === path.resolve(homeDirectory);
}

/**
 * An environment variable is an explicit choice. CWD fallback is intentionally
 * narrower: only <workspace>/repos/auto-tinker can infer the master workspace.
 */
export function safeUninitializedWorkspaceCandidate(options: {
  cwd: string;
  explicit?: string;
  homeDirectory?: string;
}): string | null {
  const homeDirectory = options.homeDirectory ?? os.homedir();
  if (options.explicit?.trim()) {
    const explicit = path.resolve(options.explicit);
    const root = path.basename(explicit) === ".auto-tinker" ? path.dirname(explicit) : explicit;
    return isUnsafeWorkspaceRoot(root, homeDirectory) ? null : root;
  }

  const product = path.resolve(options.cwd);
  const repos = path.dirname(product);
  if (path.basename(product) !== "auto-tinker" || path.basename(repos) !== "repos") return null;
  const workspace = path.dirname(repos);
  return isUnsafeWorkspaceRoot(workspace, homeDirectory) ? null : workspace;
}

/** Removes absolute workspace identities from data returned by the viewer snapshot API. */
export function redactWorkspacePaths<T>(value: T, paths: Pick<WorkspacePaths, "root" | "vault">): T {
  if (typeof value === "string") {
    return value
      .split(paths.vault).join(".auto-tinker")
      .split(paths.root).join("[workspace]") as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactWorkspacePaths(item, paths)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, redactWorkspacePaths(nested, paths)]),
    ) as T;
  }
  return value;
}
