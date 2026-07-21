import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { randomUUID } from "node:crypto";
import { readFile, statfs } from "node:fs/promises";
import path from "node:path";
import { redactSecrets } from "./security";
import { createRecord, readAllRecords, upsertNamedRecord } from "./vault";
import { atomicWriteFile } from "./markdown";
import type { CanonicalRecord, MachineSnapshot } from "./types";

const execFileAsync = promisify(execFile);

async function commandVersion(command: string, args: string[]): Promise<{ available: boolean; version?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 2500, maxBuffer: 64 * 1024 });
    const version = redactSecrets(`${stdout || stderr}`.trim().split(/\r?\n/)[0] ?? "").slice(0, 240);
    return { available: true, ...(version ? { version } : {}) };
  } catch {
    return { available: false };
  }
}

async function physicalCoreHint(): Promise<number> {
  if (platform() === "darwin") {
    try {
      const { stdout } = await execFileAsync("sysctl", ["-n", "hw.physicalcpu"], { timeout: 1500 });
      const value = Number.parseInt(stdout.trim(), 10);
      if (Number.isFinite(value) && value > 0) return value;
    } catch {
      // Fall back to a conservative logical-core hint below.
    }
  }
  return Math.max(1, Math.ceil(cpus().length / 2));
}

export async function getCurrentDevice(workspace: string): Promise<CanonicalRecord> {
  const pointerPath = path.join(path.resolve(workspace), ".auto-tinker", "local", "current-device.md");
  const pointer = await readFile(pointerPath, "utf8").catch(() => "");
  const pointerId = /^device_id:\s*([^\s]+)\s*$/m.exec(pointer)?.[1];
  const devices = (await readAllRecords(workspace)).filter((record) => record.frontmatter.type === "device");
  const pointed = pointerId ? devices.find((record) => record.frontmatter.id === pointerId) : undefined;
  if (pointed) return pointed;
  const id = pointerId && /^device-[0-9a-f-]{36}$/.test(pointerId) ? pointerId : `device-${randomUUID()}`;
  const created = await createRecord(workspace, "device", {
    id,
    title: "This device",
    status: "active",
    privacy: "private",
    body: "A random local identity used to distinguish device-owned artifact paths without storing a hostname.",
    metadata: { label: "This device" },
  });
  await atomicWriteFile(
    pointerPath,
    `---\ndevice_id: ${created.frontmatter.id}\n---\n\n# Current device\n\nThis local-only pointer is intentionally excluded from sync.\n`,
  );
  return created;
}

export async function currentDeviceId(workspace: string): Promise<string> {
  return (await getCurrentDevice(workspace)).frontmatter.id;
}

export async function inspectMachine(workspace: string): Promise<MachineSnapshot> {
  const device = await getCurrentDevice(workspace);
  const tools = Object.fromEntries(
    await Promise.all(
      [
        ["git", ["--version"]],
        ["gh", ["--version"]],
        ["docker", ["--version"]],
        ["node", ["--version"]],
        ["npm", ["--version"]],
        ["python3", ["--version"]],
        ["go", ["version"]],
        ["rustc", ["--version"]],
      ].map(async ([command, args]) => [command as string, await commandVersion(command as string, args as string[])] as const),
    ),
  );
  let workspaceFreeBytes: number | undefined;
  if (workspace) {
    try {
      const stats = await statfs(workspace);
      workspaceFreeBytes = stats.bavail * stats.bsize;
    } catch {
      // Optional capacity hint only.
    }
  }
  return {
    device_id: device.frontmatter.id,
    device_label: String(device.frontmatter.label ?? device.frontmatter.title),
    platform: platform(),
    release: release(),
    architecture: process.arch,
    cpu_model: cpus()[0]?.model ?? "unknown",
    physical_hint: await physicalCoreHint(),
    logical_cores: cpus().length,
    memory_bytes: totalmem(),
    free_memory_bytes: freemem(),
    ...(workspaceFreeBytes !== undefined ? { workspace_free_bytes: workspaceFreeBytes } : {}),
    tools,
  };
}

export async function inspectAndSaveMachine(workspace: string): Promise<{ snapshot: MachineSnapshot; record: CanonicalRecord }> {
  const snapshot = await inspectMachine(workspace);
  const record = await upsertNamedRecord(workspace, "machine", `machine-${snapshot.device_id}`, {
    title: `${snapshot.device_label} (${snapshot.architecture})`,
    status: "available",
    privacy: "private",
    confidence: 1,
    tags: [snapshot.platform, snapshot.architecture],
    body: "Local capability snapshot used to avoid recommending experiments this machine cannot reasonably run.",
    metadata: { ...snapshot },
  });
  return { snapshot, record };
}
