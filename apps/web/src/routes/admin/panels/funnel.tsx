import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import type { Metrics } from "../use-metrics";

const FUNNEL_STEP_LABEL_KEYS = {
  signup: "admin.funnelSignup",
  first_dog: "admin.funnelFirstDog",
  first_journal: "admin.funnelFirstJournal",
} as const satisfies Record<string, MessageKey>;

function getFunnelStepLabelKey(step: string): MessageKey | null {
  return Object.prototype.hasOwnProperty.call(FUNNEL_STEP_LABEL_KEYS, step)
    ? FUNNEL_STEP_LABEL_KEYS[step as keyof typeof FUNNEL_STEP_LABEL_KEYS]
    : null;
}

export function Funnel({ funnel }: { funnel: Metrics["funnel"] }) {
  const { t } = useI18n();
  const top = funnel[0]?.users || 1;
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">
        {t("admin.activationFunnel")}
      </h2>
      <div className="space-y-2">
        {funnel.map((f) => {
          const labelKey = getFunnelStepLabelKey(f.step);

          return (
            <div key={f.step} className="flex items-center gap-3">
              <div className="w-32 text-sm text-slate">{labelKey ? t(labelKey) : f.step}</div>
              <div className="h-5 flex-1 rounded bg-silver/40">
                <div
                  className="h-5 rounded bg-copper"
                  style={{ width: `${Math.max(2, (f.users / top) * 100)}%` }}
                />
              </div>
              <div className="w-12 text-right text-sm tabular-nums text-slate">{f.users}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
