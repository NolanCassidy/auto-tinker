import type { ArtifactAvailability, ArtifactLocation } from "@/lib/auto-tinker/types";

type DeviceAwareLocation = ArtifactLocation & { device_id?: string };

export function viewerArtifactAvailability(
  location: DeviceAwareLocation,
  currentDeviceId?: string,
): ArtifactAvailability {
  if (location.kind !== "local" || location.availability !== "present") return location.availability;
  return currentDeviceId && location.device_id === currentDeviceId ? "present" : "unverified";
}

export function hasPassingTestEvidence(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.some((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const evidence = candidate as Record<string, unknown>;
    return evidence.kind === "test" && evidence.status === "pass";
  });
}
