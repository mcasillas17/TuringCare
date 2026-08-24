import {
  type Locale,
  type MessageKey,
  type UtcDateFormatOptions,
  createI18n,
  formatDateInUtc,
  translate,
} from "@turingcare/i18n";
import type { ProgressGoal } from "./progress";

type BriefInput = {
  dog: { name: string; breed?: string | null; size: string; sex: string };
  concerns: { concern: string; severity: string }[];
  goals: { goal: string }[];
  entries: {
    note: string;
    kind: "moment" | "daily_checkin";
    trend?: "better" | "same" | "harder" | null;
    behavior?: string | null;
    antecedent?: string | null;
    consequence?: string | null;
    intensity?: number | null;
    occurredAt: string;
  }[];
  windowDays: number | null;
  progress?: ProgressGoal[];
};

type BriefTranslator = (key: MessageKey, vars?: Record<string, string | number>) => string;

function stripSpanishDatePeriods(value: string) {
  return value.replace(/\./g, "");
}

function truncateNote(note: string) {
  return note.length <= 80 ? note : `${note.slice(0, 77)}...`;
}

const CONFIDENCE_KEYS = {
  1: "generatedBrief.confidence.level1",
  2: "generatedBrief.confidence.level2",
  3: "generatedBrief.confidence.level3",
  4: "generatedBrief.confidence.level4",
  5: "generatedBrief.confidence.level5",
} as const satisfies Record<1 | 2 | 3 | 4 | 5, MessageKey>;

const SEVERITY_KEYS = {
  mild: "generatedBrief.severity.mild",
  moderate: "generatedBrief.severity.moderate",
  severe: "generatedBrief.severity.severe",
} as const satisfies Record<string, MessageKey>;

const SIZE_KEYS = {
  small: {
    male: "generatedBrief.size.smallMale",
    female: "generatedBrief.size.smallFemale",
  },
  medium: {
    male: "generatedBrief.size.mediumMale",
    female: "generatedBrief.size.mediumFemale",
  },
  large: {
    male: "generatedBrief.size.largeMale",
    female: "generatedBrief.size.largeFemale",
  },
  giant: {
    male: "generatedBrief.size.giantMale",
    female: "generatedBrief.size.giantFemale",
  },
} as const satisfies Record<string, Record<"male" | "female", MessageKey>>;

function createBriefTranslator(locale: Locale): BriefTranslator {
  const i18n = createI18n(locale);
  return (key, vars) => translate(i18n, key, vars);
}

function confidenceLabel(confidence: number, t: BriefTranslator) {
  const level = confidence >= 1 && confidence <= 5 ? (confidence as 1 | 2 | 3 | 4 | 5) : 1;
  return t(CONFIDENCE_KEYS[level]);
}

function dogLine(dog: BriefInput["dog"], t: BriefTranslator) {
  const sex = dog.sex === "male" ? "male" : "female";
  const sizeKeys = SIZE_KEYS[dog.size as keyof typeof SIZE_KEYS];

  return t("generatedBrief.dogLine", {
    name: dog.name,
    article: t(`generatedBrief.dogArticle.${sex}`),
    noun: t(`generatedBrief.dogNoun.${sex}`),
    size: sizeKeys ? t(sizeKeys[sex]) : dog.size,
    breed: dog.breed ? ` ${dog.breed}` : "",
  });
}

function formatBriefDate(value: string, locale: Locale, options: UtcDateFormatOptions): string {
  const formatted = formatDateInUtc(locale, value, options);
  if (!formatted) throw new RangeError("Invalid generated Brief date");
  return locale === "es" ? stripSpanishDatePeriods(formatted) : formatted;
}

function entryDate(iso: string, locale: Locale) {
  return formatBriefDate(iso, locale, { day: "numeric", month: "short", year: "numeric" });
}

function reachedDate(iso: string, locale: Locale) {
  return formatBriefDate(iso, locale, { day: "numeric", month: "short" });
}

function weeksBetween(first: string | null, last: string | null) {
  if (!first || !last) return null;
  const weekMs = 1000 * 60 * 60 * 24 * 7;
  const weeks = Math.round((new Date(last).getTime() - new Date(first).getTime()) / weekMs);
  return weeks > 0 ? weeks : null;
}

function sessionSummary(skill: ProgressGoal["skills"][number], t: BriefTranslator) {
  const weeks = weeksBetween(skill.firstSessionAt, skill.lastSessionAt);
  if (skill.sessionCount === 0) return t("generatedBrief.noSessions");
  if (skill.sessionCount === 1) return t("generatedBrief.oneSession");
  return weeks
    ? t("generatedBrief.manySessionsOverWeeks", { count: skill.sessionCount, weeks })
    : t("generatedBrief.manySessions", { count: skill.sessionCount });
}

export function composeBrief(i: BriefInput, locale: Locale = "en"): string {
  const { dog, concerns, goals, entries, progress = [], windowDays } = i;
  const t = createBriefTranslator(locale);
  const lines: string[] = [];
  lines.push(dogLine(dog, t));
  lines.push("");
  lines.push(t("generatedBrief.concerns"));
  lines.push(
    concerns.length
      ? concerns
          .map((concern) => {
            const severityKey = SEVERITY_KEYS[concern.severity as keyof typeof SEVERITY_KEYS];
            const severity = severityKey ? t(severityKey) : concern.severity;
            return `- ${concern.concern} (${severity})`;
          })
          .join("\n")
      : t("generatedBrief.noneRecorded"),
  );
  lines.push("");
  lines.push(t("generatedBrief.goals"));
  lines.push(
    goals.length
      ? goals.map((goal) => `- ${goal.goal}`).join("\n")
      : t("generatedBrief.noneRecorded"),
  );
  lines.push("");
  const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const intensities = entries
    .map((entry) => entry.intensity)
    .filter((value): value is number => typeof value === "number");
  const avg = intensities.length
    ? t("generatedBrief.averageIntensity", {
        value: (intensities.reduce((sum, value) => sum + value, 0) / intensities.length).toFixed(1),
      })
    : t("generatedBrief.averageIntensityMissing");
  const windowPhrase =
    windowDays === null
      ? t("generatedBrief.allTime")
      : t("generatedBrief.lastDays", { days: windowDays });
  lines.push(
    t("generatedBrief.journalLine", {
      count: entries.length,
      entryLabel: t(entries.length === 1 ? "generatedBrief.entryOne" : "generatedBrief.entryOther"),
      windowPhrase,
      average: avg,
    }),
  );
  const checkins = entries.filter((entry) => entry.kind === "daily_checkin");
  if (checkins.length > 0) {
    const tally = { better: 0, same: 0, harder: 0 };
    for (const entry of checkins) {
      if (entry.trend) tally[entry.trend] += 1;
    }
    lines.push(
      t("generatedBrief.checkIns", {
        better: tally.better,
        same: tally.same,
        harder: tally.harder,
      }),
    );
  }
  for (const e of sorted.slice(0, 10)) {
    const details = [
      e.antecedent ? `${t("generatedBrief.antecedentPrefix")} ${e.antecedent}` : null,
      e.behavior ? `${t("generatedBrief.behaviorPrefix")} ${e.behavior}` : null,
      e.consequence ? `${t("generatedBrief.consequencePrefix")} ${e.consequence}` : null,
    ].filter(Boolean);
    const intensity =
      typeof e.intensity === "number" ? t("generatedBrief.intensity", { value: e.intensity }) : "";
    lines.push(
      `- ${entryDate(e.occurredAt, locale)}: ${e.note}${intensity}${details.length ? ` — ${details.join(" ")}` : ""}`,
    );
  }
  const progressGoals = progress.filter((goal) => goal.skills.length > 0);
  if (progressGoals.length > 0) {
    lines.push("");
    lines.push(t("generatedBrief.progressHeading"));
    for (const goal of progressGoals) {
      const avgConfidence = goal.avgConfidence ?? 0;
      lines.push(
        t("generatedBrief.goalProgress", {
          goal: goal.goal,
          label: confidenceLabel(Math.round(avgConfidence), t),
          average: avgConfidence.toFixed(1),
        }),
      );
      for (const skill of goal.skills) {
        const label = confidenceLabel(skill.confidence, t);
        const reached = skill.milestones?.find((m) => m.level === skill.confidence)?.reachedAt;
        const when = reached
          ? t("generatedBrief.reached", { date: reachedDate(reached, locale) })
          : "";
        lines.push(
          t("generatedBrief.skillProgress", {
            name: skill.name,
            level: skill.confidence,
            label,
            reached: when,
            sessions: sessionSummary(skill, t),
          }),
        );
        if (skill.lastNote) {
          lines.push(t("generatedBrief.lastNote", { note: truncateNote(skill.lastNote) }));
        }
      }
    }
  }
  return lines.join("\n");
}
