import { useI18n } from "@/i18n";
import { dayKey } from "@/lib/week";
import type { FocusSession, FocusSkill } from "@/lib/weekly-focus";
import { formatDateInUtc } from "@turingcare/i18n";
import { useState } from "react";

type Props = {
  focusSkills: FocusSkill[];
  days: Date[];
  today: Date;
  onLog: (skillId: string, day: Date) => void;
  onRemove: (skillId: string, sessionId: string) => void;
};

function sessionsForCell(skill: FocusSkill, key: string): FocusSession[] {
  return skill.sessions.filter((s) => dayKey(new Date(s.occurredAt)) === key);
}

export function WeekGrid({ focusSkills, days, today, onLog, onRemove }: Props) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState<{ skillId: string; key: string } | null>(null);
  const todayKey = dayKey(today);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left font-medium text-slate-soft"> </th>
            {days.map((d) => {
              const key = dayKey(d);
              const weekdayLabel = formatDateInUtc(locale, key, { weekday: "short" }) ?? "";
              const dayOfMonthLabel = formatDateInUtc(locale, key, { day: "numeric" }) ?? "";
              return (
                <th
                  key={key}
                  className={`p-2 text-center font-medium ${
                    key === todayKey ? "text-slate" : "text-slate-soft"
                  }`}
                >
                  {weekdayLabel}
                  <div className="text-xs">{dayOfMonthLabel}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {focusSkills.map((skill) => (
            <tr key={skill.skillId} className="border-t border-silver">
              <td className="p-2 align-top">
                <div className="font-medium text-slate">{skill.name}</div>
                <div className="text-xs text-slate-soft">{skill.goalName}</div>
              </td>
              {days.map((d) => {
                const key = dayKey(d);
                const cellSessions = sessionsForCell(skill, key);
                const isFuture = d.getTime() > today.getTime() && key !== todayKey;
                const count = cellSessions.length;
                const isOpen = open?.skillId === skill.skillId && open?.key === key;
                const accessibleDay =
                  formatDateInUtc(locale, key, {
                    day: "numeric",
                    month: "long",
                    weekday: "long",
                    year: "numeric",
                  }) ?? "";
                return (
                  <td key={key} className="relative p-1 text-center align-middle">
                    <button
                      type="button"
                      disabled={isFuture}
                      aria-label={
                        count > 0
                          ? t("week.cellFilled", {
                              skill: skill.name,
                              day: accessibleDay,
                              n: count,
                            })
                          : t("week.cellLog", { skill: skill.name, day: accessibleDay })
                      }
                      onClick={() =>
                        count > 0
                          ? setOpen(isOpen ? null : { skillId: skill.skillId, key })
                          : onLog(skill.skillId, d)
                      }
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-base ${
                        isFuture
                          ? "cursor-not-allowed text-silver"
                          : count > 0
                            ? "bg-copper/15 text-copper hover:bg-copper/25"
                            : "text-silver hover:bg-surface-sand hover:text-slate"
                      }`}
                    >
                      {count > 1 ? count : count === 1 ? "●" : "·"}
                    </button>
                    {isOpen && (
                      <div className="absolute left-1/2 z-20 mt-1 w-44 -translate-x-1/2 space-y-1 rounded border border-silver bg-white p-2 text-left shadow-md">
                        {cellSessions.map((s) => (
                          <div key={s.id} className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-soft">
                              {new Date(s.occurredAt).toLocaleTimeString(locale, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                              {s.durationMinutes != null
                                ? ` · ${t(
                                    s.durationMinutes === 1
                                      ? "units.minuteOne"
                                      : "units.minuteOther",
                                    { n: s.durationMinutes },
                                  )}`
                                : ""}
                            </span>
                            <button
                              type="button"
                              aria-label={t("week.remove")}
                              className="text-xs text-red-600 hover:underline"
                              onClick={() => {
                                onRemove(skill.skillId, s.id);
                                if (cellSessions.length <= 1) setOpen(null);
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="w-full rounded bg-slate px-2 py-1 text-xs text-cream"
                          onClick={() => onLog(skill.skillId, d)}
                        >
                          {t("week.logAnother")}
                        </button>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
