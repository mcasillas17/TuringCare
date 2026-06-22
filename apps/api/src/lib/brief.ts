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

const confidenceLabels: Record<number, string> = {
  1: "Not yet",
  2: "Learning",
  3: "Sometimes",
  4: "Usually",
  5: "Consistently",
};

function confidenceLabel(confidence: number) {
  return confidenceLabels[confidence] ?? "Not yet";
}

function truncateNote(note: string) {
  return note.length <= 80 ? note : `${note.slice(0, 77)}...`;
}

function weeksBetween(first: string | null, last: string | null) {
  if (!first || !last) return null;
  const weekMs = 1000 * 60 * 60 * 24 * 7;
  const weeks = Math.round((new Date(last).getTime() - new Date(first).getTime()) / weekMs);
  return weeks > 0 ? weeks : null;
}

function sessionSummary(skill: ProgressGoal["skills"][number]) {
  if (skill.sessionCount === 0) return "no sessions yet";
  if (skill.sessionCount === 1) return "1 session";
  const weeks = weeksBetween(skill.firstSessionAt, skill.lastSessionAt);
  return `${skill.sessionCount} sessions${weeks ? ` over ${weeks} wks` : ""}`;
}

export function composeBrief(i: BriefInput): string {
  const { dog, concerns, goals, entries, progress = [], windowDays } = i;
  const lines: string[] = [];
  lines.push(`${dog.name} is a ${dog.size} ${dog.sex}${dog.breed ? ` ${dog.breed}` : ""}.`);
  lines.push("");
  lines.push("Concerns:");
  lines.push(
    concerns.length
      ? concerns.map((c) => `- ${c.concern} (${c.severity})`).join("\n")
      : "- none recorded",
  );
  lines.push("");
  lines.push("Goals:");
  lines.push(goals.length ? goals.map((g) => `- ${g.goal}`).join("\n") : "- none recorded");
  lines.push("");
  const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const intensities = entries
    .map((entry) => entry.intensity)
    .filter((value): value is number => typeof value === "number");
  const avg = intensities.length
    ? `average intensity ${(intensities.reduce((sum, value) => sum + value, 0) / intensities.length).toFixed(1)}`
    : "average intensity not recorded";
  const windowPhrase = windowDays === null ? "(all time)" : `in the last ${windowDays} days`;
  lines.push(
    `Journal: ${entries.length} ${entries.length === 1 ? "entry" : "entries"} ${windowPhrase}, ${avg}.`,
  );
  const checkins = entries.filter((entry) => entry.kind === "daily_checkin");
  if (checkins.length > 0) {
    const tally = { better: 0, same: 0, harder: 0 };
    for (const entry of checkins) {
      if (entry.trend) tally[entry.trend] += 1;
    }
    lines.push(`Check-ins: ${tally.better} better, ${tally.same} same, ${tally.harder} harder.`);
  }
  for (const e of sorted.slice(0, 10)) {
    const details = [
      e.antecedent ? `A: ${e.antecedent}` : null,
      e.behavior ? `B: ${e.behavior}` : null,
      e.consequence ? `C: ${e.consequence}` : null,
    ].filter(Boolean);
    const intensity = typeof e.intensity === "number" ? ` (intensity ${e.intensity})` : "";
    lines.push(
      `- ${e.occurredAt.slice(0, 10)}: ${e.note}${intensity}${details.length ? ` — ${details.join(" ")}` : ""}`,
    );
  }
  const progressGoals = progress.filter((goal) => goal.skills.length > 0);
  if (progressGoals.length > 0) {
    lines.push("");
    lines.push("Training progress:");
    for (const goal of progressGoals) {
      const avgConfidence = goal.avgConfidence ?? 0;
      lines.push(
        `  ${goal.goal} -- ${confidenceLabel(Math.round(avgConfidence))} (${avgConfidence.toFixed(1)}/5)`,
      );
      for (const skill of goal.skills) {
        const label = confidenceLabel(skill.confidence);
        const reached = skill.milestones?.find((m) => m.level === skill.confidence)?.reachedAt;
        const when = reached
          ? ` (reached ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(reached))})`
          : "";
        lines.push(
          `    * ${skill.name} — Level ${skill.confidence}: ${label}${when} — ${sessionSummary(skill)}`,
        );
        if (skill.lastNote) lines.push(`      last: "${truncateNote(skill.lastNote)}"`);
      }
    }
  }
  return lines.join("\n");
}
