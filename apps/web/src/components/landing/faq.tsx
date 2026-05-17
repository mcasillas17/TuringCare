import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "./reveal";

const QA = [
  {
    q: "Is it really force-free?",
    a: "Yes. TuringCare is built around reward-based, science-supported methods. We don't endorse prong collars, shock, or fear-based techniques.",
  },
  {
    q: "Do I need a trainer to start?",
    a: "No. Start the behavior journal on your own today. When you're ready, the Behavior Brief makes bringing in a trainer painless.",
  },
  {
    q: "What is a Behavior Brief?",
    a: "An exportable summary of your dog's profile, concerns, goals and ABC journal entries — formatted so a trainer can understand the situation in minutes.",
  },
  {
    q: "Is my data private?",
    a: "Your journal is tied to your account and only shared when you choose to export or send a Brief. We don't sell data.",
  },
  {
    q: "What does it cost?",
    a: "The core journal and Behavior Brief are free while we're early. Get started today and you'll keep your data as the product grows.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="bg-surface-sand px-5 py-24">
      <div className="mx-auto max-w-2xl">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold text-slate md:text-4xl">
            Questions, answered
          </h2>
        </Reveal>
        <Reveal delay={100} className="mt-10">
          <Accordion type="single" collapsible className="w-full">
            {QA.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-left text-slate">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-slate-soft">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
