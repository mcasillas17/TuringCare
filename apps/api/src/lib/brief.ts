import type { ProgressGoal } from "./progress";

type BriefInput = {
  dog: { name: string; breed?: string | null; size: string; sex: string };
  concerns: { concern: string; severity: string }[];
  goals: { goal: string }[];
  entries: {
    note: string;
    behavior?: string | null;
    antecedent?: string | null;
    consequence?: string | null;
    intensity?: number | null;
    occurredAt: string;
  }[];
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
  const { dog, concerns, goals, entries, progress = [] } = i;
  const lines: string[] = [];
  lines.push(`Behavior Brief — ${dog.name}`);
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
  lines.push(
    `Journal: ${entries.length} journal ${entries.length === 1 ? "entry" : "entries"}, ${avg}.`,
  );
  for (const e of sorted.slice(0, 5)) {
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
        lines.push(`    * ${skill.name} -- ${skill.confidence}/5, ${sessionSummary(skill)}`);
        if (skill.lastNote) lines.push(`      last: "${truncateNote(skill.lastNote)}"`);
      }
    }
  }
  return lines.join("\n");
}
