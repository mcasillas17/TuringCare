import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface MigrationJournalEntry {
  tag: string;
  [key: string]: unknown;
}

export function selectPredeployEntries<T extends MigrationJournalEntry>(
  entries: readonly T[],
  postdeployTag: string,
): T[] {
  const postdeployIndex = entries.findIndex(({ tag }) => tag === postdeployTag);
  if (postdeployIndex < 0) {
    throw new Error(`post-deploy migration ${postdeployTag} not found`);
  }
  if (postdeployIndex !== entries.length - 1) {
    throw new Error(`post-deploy migration ${postdeployTag} must be the latest migration`);
  }
  return entries.slice(0, postdeployIndex);
}

export async function preparePredeployMigrationFolder(
  sourceFolder: string,
  destinationFolder: string,
  postdeployTag: string,
): Promise<void> {
  const journalPath = join(sourceFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    entries?: MigrationJournalEntry[];
    [key: string]: unknown;
  };
  if (!Array.isArray(journal.entries)) throw new Error("migration journal entries are missing");
  const entries = selectPredeployEntries(journal.entries, postdeployTag);

  await mkdir(join(destinationFolder, "meta"), { recursive: true });
  await writeFile(
    join(destinationFolder, "meta", "_journal.json"),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
  );
  await Promise.all(
    entries.map(({ tag }) =>
      copyFile(join(sourceFolder, `${tag}.sql`), join(destinationFolder, `${tag}.sql`)),
    ),
  );
}
