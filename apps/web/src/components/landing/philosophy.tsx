import { useI18n } from "@/i18n";
import { Reveal } from "./reveal";

export function Philosophy() {
  const { t } = useI18n();

  const PRINCIPLES = [
    { h: t("philosophy.p1h"), p: t("philosophy.p1p") },
    { h: t("philosophy.p2h"), p: t("philosophy.p2p") },
    { h: t("philosophy.p3h"), p: t("philosophy.p3p") },
    { h: t("philosophy.p4h"), p: t("philosophy.p4p") },
  ];

  return (
    <section className="bg-slate px-5 py-24 text-cream">
      <div className="mx-auto max-w-5xl">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-bold md:text-4xl">{t("philosophy.title")}</h2>
          <p className="mt-4 text-silver">{t("philosophy.subcopy")}</p>
        </Reveal>
        <div className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {PRINCIPLES.map((pr, i) => (
            <Reveal key={pr.h} delay={i * 90}>
              <div className="border-l-2 border-copper pl-5">
                <h3 className="text-lg font-semibold text-gold">{pr.h}</h3>
                <p className="mt-1.5 text-sm text-silver">{pr.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
