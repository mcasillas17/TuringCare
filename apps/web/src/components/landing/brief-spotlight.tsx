import { useI18n } from "@/i18n";
import { Check } from "lucide-react";
import { Reveal } from "./reveal";

export function BriefSpotlight() {
  const { t } = useI18n();

  const BENEFITS = [
    t("briefSpotlight.benefit1"),
    t("briefSpotlight.benefit2"),
    t("briefSpotlight.benefit3"),
    t("briefSpotlight.benefit4"),
  ];

  return (
    <section id="brief" className="bg-surface-sand px-5 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <Reveal>
          <h2 className="text-3xl font-bold text-slate md:text-4xl">{t("briefSpotlight.title")}</h2>
          <p className="mt-4 text-slate-soft">{t("briefSpotlight.body")}</p>
          <ul className="mt-7 space-y-3">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-slate text-cream"
                >
                  <Check className="size-3.5" />
                </span>
                <span className="text-sm text-slate-soft">{b}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120}>
          {/* Illustrative mock — not real data */}
          <div className="rounded-2xl border border-silver bg-surface p-6 shadow-md">
            <div className="flex items-center justify-between border-b border-silver/70 pb-4">
              <div>
                <p className="text-xs font-semibold tracking-wide text-slate-soft uppercase">
                  {t("briefSpotlight.cardKicker")}
                </p>
                <p className="text-lg font-bold text-slate">{t("briefSpotlight.cardDog")}</p>
              </div>
              <span className="rounded-full bg-slate px-3 py-1 text-xs font-medium text-cream">
                {t("briefSpotlight.cardDraft")}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                {
                  t: t("briefSpotlight.cardRow1"),
                  s: t("briefSpotlight.cardRow1Sev"),
                  c: "bg-gold/25 text-slate",
                },
                {
                  t: t("briefSpotlight.cardRow2"),
                  s: t("briefSpotlight.cardRow2Sev"),
                  c: "bg-ice/25 text-slate",
                },
              ].map((row) => (
                <div
                  key={row.t}
                  className="flex items-center justify-between rounded-lg bg-surface-sand px-4 py-3"
                >
                  <span className="text-sm font-medium text-slate">{row.t}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${row.c}`}>{row.s}</span>
                </div>
              ))}
              <div className="rounded-lg border border-dashed border-silver px-4 py-3 text-xs text-slate-soft">
                {t("briefSpotlight.cardAbc")}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
