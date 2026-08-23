import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { preparePredeployMigrationFolder, selectPredeployEntries } from "./migration-rollout";

describe("selectPredeployEntries", () => {
  const entries = [
    { tag: "0012_existing" },
    { tag: "0013_locale" },
    { tag: "0014_brief_version_constraint" },
  ];

  it("keeps every schema-compatible migration before the named post-deploy migration", () => {
    expect(selectPredeployEntries(entries, "0014_brief_version_constraint")).toEqual([
      { tag: "0012_existing" },
      { tag: "0013_locale" },
    ]);
  });

  it("fails closed if the named post-deploy migration is missing or no longer last", () => {
    expect(() => selectPredeployEntries(entries, "0015_missing")).toThrow(/not found/);
    expect(() =>
      selectPredeployEntries([...entries, { tag: "0015_new" }], "0014_brief_version_constraint"),
    ).toThrow(/must be the latest/);
  });

  it("builds a temporary migration folder without the post-deploy SQL", async () => {
    const root = await mkdtemp(join(tmpdir(), "migration-rollout-test-"));
    const source = join(root, "source");
    const destination = join(root, "destination");
    try {
      await mkdir(join(source, "meta"), { recursive: true });
      await writeFile(
        join(source, "meta", "_journal.json"),
        JSON.stringify({ version: "7", entries }),
      );
      await Promise.all(
        entries.map(({ tag }) => writeFile(join(source, `${tag}.sql`), `SELECT '${tag}';`)),
      );

      await preparePredeployMigrationFolder(source, destination, "0014_brief_version_constraint");

      const prepared = JSON.parse(
        await readFile(join(destination, "meta", "_journal.json"), "utf8"),
      ) as { entries: Array<{ tag: string }> };
      expect(prepared.entries.map(({ tag }) => tag)).toEqual(["0012_existing", "0013_locale"]);
      await expect(readFile(join(destination, "0013_locale.sql"), "utf8")).resolves.toContain(
        "0013_locale",
      );
      await expect(
        readFile(join(destination, "0014_brief_version_constraint.sql"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
