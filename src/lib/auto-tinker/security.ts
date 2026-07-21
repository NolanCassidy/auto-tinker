const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi },
  { name: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { name: "gitlab-token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: "npm-token", pattern: /\bnpm_[A-Za-z0-9]{20,}\b/g },
  { name: "stripe-secret", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { name: "anthropic-key", pattern: /\bsk-ant-api\d{2}-[A-Za-z0-9_-]{20,}\b/g },
  { name: "gcp-api-key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: "aws-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: "signed-url",
    pattern: /\bhttps?:\/\/[^\s<>'"]+\?(?=[^\s<>'"]*(?:X-Amz-(?:Signature|Credential)|GoogleAccessId|Signature|sig|se|sp|sv)=)[^\s<>'"]+/gi,
  },
  { name: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{18,}=*/gi },
  {
    name: "assigned-secret",
    pattern: /\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|account[_-]?key|password|passwd)\s*[:=]\s*(["']?)([^\s,"']{8,})\2/gi,
  },
  { name: "credential-url", pattern: /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi },
];

export interface SecretScanResult {
  ok: boolean;
  scanned_files: number;
  skipped_files: number;
  skipped_details: Array<{
    path: string;
    reason: "file-limit" | "unreadable" | "symlink" | "large-file" | "binary" | "unsupported";
    size_bytes?: number;
  }>;
  findings: Array<{ path: string; kinds: string[] }>;
}

export interface SecretFinding {
  kind: string;
  index: number;
}

export function findPotentialSecrets(value: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      findings.push({ kind: name, index: match.index });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  return findings;
}

export function containsPotentialSecret(value: string): boolean {
  return findPotentialSecrets(value).length > 0;
}

export function redactSecrets(value: string): string {
  let result = value;
  for (const { name, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (name === "assigned-secret") {
      result = result.replace(pattern, (_match, key: string) => `${key}: [REDACTED]`);
    } else if (name === "credential-url") {
      result = result.replace(pattern, "$1[REDACTED]@");
    } else {
      result = result.replace(pattern, `[REDACTED:${name}]`);
    }
  }
  return result;
}

export function sanitizeUnknown<T>(value: T): T {
  if (typeof value === "string") return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeUnknown(item)) as T;
  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) cleaned[key] = sanitizeUnknown(item);
    return cleaned as T;
  }
  return value;
}

export async function scanPathForSecrets(
  root: string,
  options: { maxFiles?: number; maxBytes?: number; ignoredDirectories?: string[]; includedFiles?: string[] } = {},
): Promise<SecretScanResult> {
  const [{ lstat, readFile, readdir }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const maxFiles = options.maxFiles ?? 5000;
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const findings: SecretScanResult["findings"] = [];
  const skippedDetails: SecretScanResult["skipped_details"] = [];
  let scanned = 0;
  let skipped = 0;
  const ignoredDirectories = new Set(options.ignoredDirectories ?? [".git", "node_modules", ".next", "dist", "build", "coverage", ".turbo"]);

  function recordSkip(
    target: string,
    reason: SecretScanResult["skipped_details"][number]["reason"],
    sizeBytes?: number,
  ): void {
    skipped += 1;
    if (skippedDetails.length < 100) {
      skippedDetails.push({
        path: path.relative(root, target) || path.basename(target),
        reason,
        ...(sizeBytes !== undefined ? { size_bytes: sizeBytes } : {}),
      });
    }
  }

  async function scan(target: string): Promise<void> {
    if (scanned + skipped >= maxFiles) {
      recordSkip(target, "file-limit");
      return;
    }
    const info = await lstat(target).catch(() => undefined);
    if (!info) {
      recordSkip(target, "unreadable");
      return;
    }
    if (info.isSymbolicLink()) {
      recordSkip(target, "symlink");
      return;
    }
    if (info.isDirectory()) {
      if (target !== root && ignoredDirectories.has(path.basename(target))) return;
      const entries = await readdir(target).catch(() => undefined);
      if (!entries) {
        recordSkip(target, "unreadable");
        return;
      }
      for (const entry of entries) await scan(path.join(target, entry));
      return;
    }
    if (!info.isFile()) {
      recordSkip(target, "unsupported");
      return;
    }
    if (info.size > maxBytes) {
      recordSkip(target, "large-file", info.size);
      return;
    }
    const buffer = await readFile(target).catch(() => undefined);
    if (!buffer) {
      recordSkip(target, "unreadable", info.size);
      return;
    }
    if (buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0)) {
      recordSkip(target, "binary", info.size);
      return;
    }
    scanned += 1;
    const kinds = [...new Set(findPotentialSecrets(buffer.toString("utf8")).map((finding) => finding.kind))];
    if (kinds.length) findings.push({ path: path.relative(root, target) || path.basename(target), kinds });
  }
  if (options.includedFiles) {
    for (const included of new Set(options.includedFiles)) {
      const target = path.resolve(root, included);
      const relative = path.relative(path.resolve(root), target);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        recordSkip(target, "unsupported");
        continue;
      }
      await scan(target);
    }
  } else {
    await scan(root);
  }
  return {
    ok: findings.length === 0 && skipped === 0,
    scanned_files: scanned,
    skipped_files: skipped,
    skipped_details: skippedDetails,
    findings,
  };
}
