import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useI18n } from "@/i18n";
import { Reveal } from "./reveal";

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
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-slate md:text-4xl">{t("faq.title")}</h2>
        </Reveal>
        <Reveal delay={100} className="mt-10">
          <Accordion type="single" collapsible className="w-full">
            {QA.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-left text-slate">{item.q}</AccordionTrigger>
                <AccordionContent className="text-slate-soft">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
