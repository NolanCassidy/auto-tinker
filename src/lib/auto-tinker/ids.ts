import { createHash, randomUUID } from "node:crypto";
import type { RecordType } from "./types";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function slugify(value: string, fallback = "item"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function stableRecordId(type: RecordType, title: string, seed?: string): string {
  const identity = seed ?? randomUUID();
  return `${type}-${slugify(title)}-${sha256(`${type}\0${identity}`).slice(0, 10)}`;
}

export function deterministicId(type: RecordType, seed: string, title: string = type): string {
  return `${type}-${slugify(title)}-${sha256(`${type}\0${seed}`).slice(0, 16)}`;
}

export function edgeId(source: string, target: string, kind: string): string {
  return `edge-${sha256(`${source}\0${kind}\0${target}`).slice(0, 20)}`;
}
