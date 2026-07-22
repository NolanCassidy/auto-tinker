import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  redactWorkspacePaths,
  safeUninitializedWorkspaceCandidate,
} from "../../src/app/api/_viewer-boundary";

describe("uninitialized viewer workspace selection", () => {
  it("uses a safe clone root before local state is initialized", () => {
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/work/projects/auto-tinker",
      homeDirectory: "/home/tester",
    })).toBe(path.resolve("/work/projects/auto-tinker"));
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/work/projects/custom-clone-name",
      homeDirectory: "/home/tester",
    })).toBe(path.resolve("/work/projects/custom-clone-name"));
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/work/legacy/repos/auto-tinker",
      homeDirectory: "/home/tester",
    })).toBe(path.resolve("/work/legacy"));
  });

  it("never selects the filesystem root or home as a workspace", () => {
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/repos/auto-tinker",
      homeDirectory: "/home/tester",
    })).toBeNull();
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/home/tester",
      homeDirectory: "/home/tester",
    })).toBeNull();
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/",
      homeDirectory: "/home/tester",
    })).toBeNull();
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/tmp/product",
      explicit: "/home/tester",
      homeDirectory: "/home/tester",
    })).toBeNull();
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/tmp/product",
      explicit: "/",
      homeDirectory: "/home/tester",
    })).toBeNull();
  });
});

describe("viewer snapshot redaction", () => {
  it("removes absolute workspace and vault paths recursively", () => {
    const paths = {
      root: "/Users/tester/code/auto-tinker",
      vault: "/Users/tester/code/auto-tinker/.auto-tinker",
    };
    const snapshot = redactWorkspacePaths({
      path: paths.root,
      nested: [paths.vault, `${paths.root}/tinkers/example`],
    }, paths);
    expect(snapshot).toEqual({
      path: "[workspace]",
      nested: [".auto-tinker", "[workspace]/tinkers/example"],
    });
    expect(JSON.stringify(snapshot)).not.toContain("/Users/tester");
  });
});
