import type { Locale } from "@turingcare/i18n";
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

type BriefCatalog = {
  confidence: Record<1 | 2 | 3 | 4 | 5, string>;
  severity: Record<string, string>;
  dogLine: (dog: BriefInput["dog"]) => string;
  concerns: string;
  goals: string;
  noneRecorded: string;
  journal: (count: number, windowPhrase: string, avg: string) => string;
  allTime: string;
  lastDays: (days: number) => string;
  avgIntensity: (value: string) => string;
  avgIntensityMissing: string;
  checkins: (better: number, same: number, harder: number) => string;
  entryDate: (iso: string) => string;
  intensity: (value: number) => string;
  progressHeading: string;
  goalProgress: (goal: string, label: string, avg: string) => string;
  skillProgress: (
    name: string,
    level: number,
    label: string,
    when: string,
    sessions: string,
  ) => string;
  reached: (date: Date) => string;
  lastNote: (note: string) => string;
  sessionSummary: (count: number, weeks: number | null) => string;
};

const esMonthDay = new Intl.DateTimeFormat("es", { month: "short", day: "numeric" });
const esDayMonthYear = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const enMonthDay = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

function stripSpanishDatePeriods(value: string) {
  return value.replace(/\./g, "");
}

function truncateNote(note: string) {
  return note.length <= 80 ? note : `${note.slice(0, 77)}...`;
}

function spanishSizeLabel(size: string, sex: string) {
  const labels: Record<string, { male: string; female: string }> = {
    small: { male: "pequeño", female: "pequeña" },
    medium: { male: "mediano", female: "mediana" },
    large: { male: "grande", female: "grande" },
    giant: { male: "gigante", female: "gigante" },
  };
  return labels[size]?.[sex === "male" ? "male" : "female"] ?? size;
}

const briefCatalog: Record<Locale, BriefCatalog> = {
  en: {
    confidence: {
      1: "Not yet",
      2: "Learning",
      3: "Sometimes",
      4: "Usually",
      5: "Consistently",
    },
    severity: { mild: "mild", moderate: "moderate", severe: "severe" },
    dogLine: (dog) => `${dog.name} is a ${dog.size} ${dog.sex}${dog.breed ? ` ${dog.breed}` : ""}.`,
    concerns: "Concerns:",
    goals: "Goals:",
    noneRecorded: "- none recorded",
    journal: (count, windowPhrase, avg) =>
      `Journal: ${count} ${count === 1 ? "entry" : "entries"} ${windowPhrase}, ${avg}.`,
    allTime: "(all time)",
    lastDays: (days) => `in the last ${days} days`,
    avgIntensity: (value) => `average intensity ${value}`,
    avgIntensityMissing: "average intensity not recorded",
    checkins: (better, same, harder) =>
      `Check-ins: ${better} better, ${same} same, ${harder} harder.`,
    entryDate: (iso) => iso.slice(0, 10),
    intensity: (value) => ` (intensity ${value})`,
    progressHeading: "Training progress:",
    goalProgress: (goal, label, avg) => `  ${goal} -- ${label} (${avg}/5)`,
    skillProgress: (name, level, label, when, sessions) =>
      `    * ${name} — Level ${level}: ${label}${when} — ${sessions}`,
    reached: (date) => ` (reached ${enMonthDay.format(date)})`,
    lastNote: (note) => `      last: "${truncateNote(note)}"`,
    sessionSummary: (count, weeks) => {
      if (count === 0) return "no sessions yet";
      if (count === 1) return "1 session";
      return `${count} sessions${weeks ? ` over ${weeks} wks` : ""}`;
    },
  },
  es: {
    confidence: {
      1: "Aún no",
      2: "Aprendiendo",
      3: "A veces",
      4: "Casi siempre",
      5: "Consistentemente",
    },
    severity: { mild: "leve", moderate: "moderada", severe: "grave" },
    dogLine: (dog) => {
      const noun = dog.sex === "male" ? "perro" : "perra";
      const article = dog.sex === "male" ? "un" : "una";
      const size = spanishSizeLabel(dog.size, dog.sex);
      return `${dog.name} es ${article} ${noun} ${size}${dog.breed ? ` ${dog.breed}` : ""}.`;
    },
    concerns: "Preocupaciones:",
    goals: "Objetivos:",
    noneRecorded: "- ninguna registrada",
    journal: (count, windowPhrase, avg) =>
      `Diario: ${count} ${count === 1 ? "entrada" : "entradas"} ${windowPhrase}, ${avg}.`,
    allTime: "(todo el tiempo)",
    lastDays: (days) => `en los últimos ${days} días`,
    avgIntensity: (value) => `intensidad promedio ${value}`,
    avgIntensityMissing: "intensidad promedio no registrada",
    checkins: (better, same, harder) =>
      `Check-ins: ${better} mejor, ${same} igual, ${harder} más difícil.`,
    entryDate: (iso) => stripSpanishDatePeriods(esDayMonthYear.format(new Date(iso))),
    intensity: (value) => ` (intensidad ${value})`,
    progressHeading: "Progreso de entrenamiento:",
    goalProgress: (goal, label, avg) => `  ${goal} -- ${label} (${avg}/5)`,
    skillProgress: (name, level, label, when, sessions) =>
      `    * ${name} — Nivel ${level}: ${label}${when} — ${sessions}`,
    reached: (date) => ` (alcanzado ${stripSpanishDatePeriods(esMonthDay.format(date))})`,
    lastNote: (note) => `      última: "${truncateNote(note)}"`,
    sessionSummary: (count, weeks) => {
      if (count === 0) return "sin sesiones todavía";
      if (count === 1) return "1 sesión";
      return `${count} sesiones${weeks ? ` durante ${weeks} sem` : ""}`;
    },
  },
};

function confidenceLabel(confidence: number, locale: Locale) {
  return (
    briefCatalog[locale].confidence[confidence as 1 | 2 | 3 | 4 | 5] ??
    briefCatalog[locale].confidence[1]
  );
}

function weeksBetween(first: string | null, last: string | null) {
  if (!first || !last) return null;
  const weekMs = 1000 * 60 * 60 * 24 * 7;
  const weeks = Math.round((new Date(last).getTime() - new Date(first).getTime()) / weekMs);
  return weeks > 0 ? weeks : null;
}

function sessionSummary(skill: ProgressGoal["skills"][number], locale: Locale) {
  const weeks = weeksBetween(skill.firstSessionAt, skill.lastSessionAt);
  return briefCatalog[locale].sessionSummary(skill.sessionCount, weeks);
}

export function composeBrief(i: BriefInput, locale: Locale = "en"): string {
  const { dog, concerns, goals, entries, progress = [], windowDays } = i;
  const t = briefCatalog[locale];
  const lines: string[] = [];
  lines.push(t.dogLine(dog));
  lines.push("");
  lines.push(t.concerns);
  lines.push(
    concerns.length
      ? concerns.map((c) => `- ${c.concern} (${t.severity[c.severity] ?? c.severity})`).join("\n")
      : t.noneRecorded,
  );
  lines.push("");
  lines.push(t.goals);
  lines.push(goals.length ? goals.map((g) => `- ${g.goal}`).join("\n") : t.noneRecorded);
  lines.push("");
  const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const intensities = entries
    .map((entry) => entry.intensity)
    .filter((value): value is number => typeof value === "number");
  const avg = intensities.length
    ? t.avgIntensity(
        (intensities.reduce((sum, value) => sum + value, 0) / intensities.length).toFixed(1),
      )
    : t.avgIntensityMissing;
  const windowPhrase = windowDays === null ? t.allTime : t.lastDays(windowDays);
  lines.push(t.journal(entries.length, windowPhrase, avg));
  const checkins = entries.filter((entry) => entry.kind === "daily_checkin");
  if (checkins.length > 0) {
    const tally = { better: 0, same: 0, harder: 0 };
    for (const entry of checkins) {
      if (entry.trend) tally[entry.trend] += 1;
    }
    lines.push(t.checkins(tally.better, tally.same, tally.harder));
  }
  for (const e of sorted.slice(0, 10)) {
    const details = [
      e.antecedent ? `A: ${e.antecedent}` : null,
      e.behavior ? `B: ${e.behavior}` : null,
      e.consequence ? `C: ${e.consequence}` : null,
    ].filter(Boolean);
    const intensity = typeof e.intensity === "number" ? t.intensity(e.intensity) : "";
    lines.push(
      `- ${t.entryDate(e.occurredAt)}: ${e.note}${intensity}${details.length ? ` — ${details.join(" ")}` : ""}`,
    );
  }
  const progressGoals = progress.filter((goal) => goal.skills.length > 0);
  if (progressGoals.length > 0) {
    lines.push("");
    lines.push(t.progressHeading);
    for (const goal of progressGoals) {
      const avgConfidence = goal.avgConfidence ?? 0;
      lines.push(
        t.goalProgress(
          goal.goal,
          confidenceLabel(Math.round(avgConfidence), locale),
          avgConfidence.toFixed(1),
        ),
      );
      for (const skill of goal.skills) {
        const label = confidenceLabel(skill.confidence, locale);
        const reached = skill.milestones?.find((m) => m.level === skill.confidence)?.reachedAt;
        const when = reached ? t.reached(new Date(reached)) : "";
        lines.push(
          t.skillProgress(skill.name, skill.confidence, label, when, sessionSummary(skill, locale)),
        );
        if (skill.lastNote) lines.push(t.lastNote(skill.lastNote));
      }
    }
  }
  return lines.join("\n");
}
