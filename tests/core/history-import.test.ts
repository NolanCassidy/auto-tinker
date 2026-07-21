import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importHistory, initializeWorkspace, readAllRecords } from "../../src/lib/auto-tinker";

const roots: string[] = [];

async function workspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "auto-tinker-history-"));
  roots.push(root);
  await initializeWorkspace(root);
  return root;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("history import", () => {
  it("creates one history-captured event when the identical source is imported repeatedly", async () => {
    const root = await workspace();
    const source = path.join(root, "work-history.txt");
    await writeFile(source, "Investigated a flaky queue worker and documented the retry boundary.\n", "utf8");

    const first = await importHistory(root, source);
    const captured = first.records[0];
    while (new Date().toISOString() === captured.frontmatter.occurred_at) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    const second = await importHistory(root, source);
    const records = await readAllRecords(root);
    const history = records.filter((record) => record.frontmatter.type === "history");
    const events = records.filter(
      (record) => record.frontmatter.type === "event" && record.frontmatter.event_kind === "history-captured",
    );

    expect(first).toMatchObject({ candidates: 1, created: 1, deduplicated: 0 });
    expect(second).toMatchObject({ candidates: 1, created: 0, deduplicated: 1 });
    expect(history).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0].frontmatter.links).toEqual([history[0].frontmatter.id]);
    expect(events[0].frontmatter.occurred_at).toBe(history[0].frontmatter.occurred_at);
  });
});
