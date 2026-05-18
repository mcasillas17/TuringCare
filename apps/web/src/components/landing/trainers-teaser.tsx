import { useI18n } from "@/i18n";
import { Reveal } from "./reveal";

export function TrainersTeaser() {
  const { t } = useI18n();

  const TAGS = [
    t("trainers.tag1"),
    t("trainers.tag2"),
    t("trainers.tag3"),
    t("trainers.tag4"),
    t("trainers.tag5"),
    t("trainers.tag6"),
    t("trainers.tag7"),
  ];

  return (
    <section id="trainers" className="bg-cream px-5 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <span className="inline-block rounded-full bg-ice/20 px-3 py-1 text-xs font-semibold tracking-wide text-slate uppercase">
            {t("trainers.badge")}
          </span>
          <h2 className="mt-5 text-3xl font-bold text-slate md:text-4xl">{t("trainers.title")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-soft">{t("trainers.subcopy")}</p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-9 flex flex-wrap justify-center gap-2.5">
            {TAGS.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-silver bg-surface px-4 py-1.5 text-sm text-slate-soft"
              >
                {tag}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
