import { useI18n } from "@/i18n";
import { ChevronDownIcon } from "lucide-react";

export function Faq() {
  const { t } = useI18n();

  const QA = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
    { q: t("faq.q5"), a: t("faq.a5") },
  ];

  return (
    <section id="faq" className="bg-surface-sand px-5 py-24">
      <div className="mx-auto max-w-2xl">
        <div className="reveal text-center">
          <h2 className="text-3xl font-bold text-slate md:text-4xl">{t("faq.title")}</h2>
        </div>
        <div className="reveal mt-10 w-full">
          {QA.map((item) => (
            <details key={item.q} name="faq" className="group not-last:border-b">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-2 rounded-lg py-2.5 text-left text-sm font-medium text-slate outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-2.5 text-sm text-slate-soft">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
