import { useI18n } from "@/i18n";
import { ClipboardList, FileText, NotebookPen } from "lucide-react";
import { Reveal } from "./reveal";

export function HowItWorks() {
  const { t } = useI18n();

  const STEPS = [
    {
      icon: ClipboardList,
      title: t("howItWorks.step1Title"),
      body: t("howItWorks.step1Body"),
    },
    {
      icon: NotebookPen,
      title: t("howItWorks.step2Title"),
      body: t("howItWorks.step2Body"),
    },
    {
      icon: FileText,
      title: t("howItWorks.step3Title"),
      body: t("howItWorks.step3Body"),
    },
  ];

  return (
    <section id="how" className="bg-cream px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate md:text-4xl">{t("howItWorks.title")}</h2>
          <p className="mt-4 text-slate-soft">{t("howItWorks.subtitle")}</p>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 110}>
              <div className="h-full rounded-2xl border border-silver/70 bg-surface p-7 shadow-sm">
                <div
                  aria-hidden="true"
                  className="grid size-12 place-items-center rounded-xl bg-slate text-cream"
                >
                  <s.icon className="size-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-soft">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
