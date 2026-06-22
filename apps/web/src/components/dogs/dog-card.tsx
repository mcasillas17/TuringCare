import { useI18n } from "@/i18n";
import type { DogOverview } from "@/lib/dogs";
import { useState } from "react";
import { DogCardBody } from "./dog-card-body";

export function DogCard({ dog }: { dog: DogOverview }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { summary } = dog;

  const training =
    summary.skillCount > 0
      ? t("dogs.glanceSkills", { skills: summary.skillCount, avg: summary.avgLevel ?? 0 })
      : summary.goalCount > 0
        ? t("dogs.glanceGoals", { goals: summary.goalCount })
        : null;
  const entries = t("dogs.glanceEntries", { entries: summary.journalCount });
  const glance = [training, entries].filter(Boolean).join(" · ");
  const briefPill =
    summary.briefStatus === "finalized"
      ? t("dogs.briefFinal", { version: summary.briefVersion ?? 1 })
      : summary.briefStatus === "draft"
        ? t("dogs.briefDraft", { version: summary.briefVersion ?? 1 })
        : t("dogs.noBrief");

  return (
    <div className="overflow-hidden rounded-2xl border border-silver bg-white">
      <button
        type="button"
        aria-expanded={open}
        aria-label={
          open
            ? t("dogs.collapseCard", { name: dog.name })
            : t("dogs.expandCard", { name: dog.name })
        }
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-slate text-lg font-bold text-cream"
          aria-hidden="true"
        >
          {dog.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-slate">
            {dog.name}
            {dog.breed ? <span className="font-medium text-slate-soft"> · {dog.breed}</span> : null}
          </span>
          <span className="mt-0.5 block text-sm text-slate-soft">
            {glance}
            <span className="ml-1.5 rounded-full bg-slate/5 px-2 py-0.5 text-xs font-semibold text-slate-soft">
              {briefPill}
            </span>
          </span>
        </span>
        <span className="text-slate-soft" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <DogCardBody dog={dog} />}
    </div>
  );
}
