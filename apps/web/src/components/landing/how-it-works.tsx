import { ClipboardList, FileText, NotebookPen } from "lucide-react";
import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Build your dog's profile",
    body: "Breed, age, history, concerns and goals — the context every trainer asks for, in one place.",
  },
  {
    icon: NotebookPen,
    title: "Log behavior with the ABC journal",
    body: "Capture Antecedent → Behavior → Consequence with intensity and context. Patterns surface fast.",
  },
  {
    icon: FileText,
    title: "Generate a Behavior Brief",
    body: "One tap turns your journal into a clean, shareable summary your force-free trainer can act on.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="bg-cream px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-slate md:text-4xl">
            From confusion to a plan in three steps
          </h2>
          <p className="mt-4 text-slate-soft">
            No jargon, no choke chains. Just structured observation that makes
            training measurable.
          </p>
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
                <h3 className="mt-5 text-lg font-semibold text-slate">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-soft">
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
