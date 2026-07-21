import { describe, expect, it } from "vitest";
import {
  hasPassingTestEvidence,
  viewerArtifactAvailability,
} from "../../src/app/api/_viewer-projection";

describe("viewer evidence projection", () => {
  it("requires an explicit passing status", () => {
    expect(hasPassingTestEvidence([{ kind: "test", summary: "ran tests" }])).toBe(false);
    expect(hasPassingTestEvidence([{ kind: "test", status: "unknown" }])).toBe(false);
    expect(hasPassingTestEvidence([{ kind: "test", status: "fail" }])).toBe(false);
    expect(hasPassingTestEvidence([{ kind: "test", status: "pass" }])).toBe(true);
  });
});

describe("device-aware local location projection", () => {
  it("shows a local path present only on its recorded current device", () => {
    const local = {
      kind: "local" as const,
      availability: "present" as const,
      path: "/workspace/tinkers/example",
    };
    expect(viewerArtifactAvailability(local, "device-a")).toBe("unverified");
    expect(viewerArtifactAvailability({ ...local, device_id: "device-b" }, "device-a")).toBe("unverified");
    expect(viewerArtifactAvailability({ ...local, device_id: "device-a" }, "device-a")).toBe("present");
  });

  it("preserves missing and remote availability", () => {
    expect(viewerArtifactAvailability({ kind: "local", availability: "missing" }, "device-a")).toBe("missing");
    expect(viewerArtifactAvailability({ kind: "github", availability: "present" }, "device-a")).toBe("present");
  });
});
