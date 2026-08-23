import { useI18n } from "@/i18n";
import { Reveal } from "./reveal";

export function Hero() {
  const { t } = useI18n();
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-cream px-5 pt-32 pb-24 md:pt-40 md:pb-32"
    >
      {/* merle-gradient accent */}
      <div
        aria-hidden
        className="tc-drift pointer-events-none absolute -right-24 -top-24 size-[34rem] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, #7fb8d6 0%, #4a5c6e 45%, #c9d4dd 70%, transparent 100%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <span className="inline-block rounded-full border border-silver bg-surface px-4 py-1 text-xs font-semibold tracking-wide text-slate-soft uppercase">
            {t("hero.eyebrow")}
          </span>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate md:text-6xl">
            {t("hero.headline")}
            <br />
            <span className="underline decoration-copper decoration-[6px] underline-offset-4">
              {t("hero.headlineEmphasis")}
            </span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-soft">{t("hero.subcopy")}</p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-8 flex flex-col items-center gap-4">
            <img
              src="/turing.jpg"
              alt={t("hero.turingAlt")}
              width={160}
              height={160}
              loading="lazy"
              decoding="async"
              className="size-40 rounded-full object-cover shadow-lg ring-4 ring-copper/40"
            />
            <p className="max-w-sm text-center text-sm text-slate-soft/80">
              {t("hero.turingCaption")}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
