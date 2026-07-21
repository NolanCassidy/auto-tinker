import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  redactWorkspacePaths,
  safeUninitializedWorkspaceCandidate,
} from "../../src/app/api/_viewer-boundary";

describe("uninitialized viewer workspace selection", () => {
  it("infers only from the exact master/repos/auto-tinker shape", () => {
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/work/master/repos/auto-tinker",
      homeDirectory: "/home/tester",
    })).toBe(path.resolve("/work/master"));
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/work/master/auto-tinker",
      homeDirectory: "/home/tester",
    })).toBeNull();
  });

  it("never selects the filesystem root or home as a workspace", () => {
    expect(safeUninitializedWorkspaceCandidate({
      cwd: "/repos/auto-tinker",
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
