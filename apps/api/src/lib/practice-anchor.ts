import { and, eq, gte, sql } from "drizzle-orm";
import { CURRICULUM_VERSION } from "../data/training-curriculum";
import { db } from "../db";
import { trainingSuggestionActions, trainingSuggestions } from "../db/schema";

type AnchorAudit = {
  level: number | null;
  fallbackLevel: number | null;
  curriculumVersion: string;
};

export async function resolvePracticeTargetAudit({
  dogId,
  skillId,
  suggestionId,
  createdAfter,
}: {
  dogId: string;
  skillId: string;
  suggestionId: string;
  createdAfter: Date;
}): Promise<AnchorAudit | null | "unavailable"> {
  try {
    const [suggestion] = await db
      .select({
        level: trainingSuggestions.level,
        fallbackLevel: trainingSuggestions.fallbackLevel,
        curriculumVersion: trainingSuggestions.curriculumVersion,
      })
      .from(trainingSuggestions)
      .where(
        and(
          eq(trainingSuggestions.id, suggestionId),
          eq(trainingSuggestions.dogId, dogId),
          eq(trainingSuggestions.skillId, skillId),
          eq(trainingSuggestions.suggestionType, "exercise"),
          eq(trainingSuggestions.suppressed, false),
          eq(trainingSuggestions.curriculumVersion, CURRICULUM_VERSION),
          gte(trainingSuggestions.createdAt, createdAfter),
        ),
      )
      .limit(1);
    return suggestion ?? null;
  } catch (error) {
    console.error("[practice] anchor_lookup_failed", { dogId, skillId, error });
    return "unavailable";
  }
}

export async function lockSuggestionAnchor(
  tx: Pick<typeof db, "execute">,
  suggestionId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`suggestion-anchor:${suggestionId}`}))`,
  );
}

export async function isSuggestionSkipped(
  tx: Pick<typeof db, "select">,
  suggestionId: string,
): Promise<boolean> {
  const [action] = await tx
    .select({ id: trainingSuggestionActions.id })
    .from(trainingSuggestionActions)
    .where(
      and(
        eq(trainingSuggestionActions.suggestionId, suggestionId),
        eq(trainingSuggestionActions.action, "skipped"),
      ),
    )
    .limit(1);
  return Boolean(action);
}
