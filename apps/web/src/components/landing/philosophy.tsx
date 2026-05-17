import { Reveal } from "./reveal";

const PRINCIPLES = [
  {
    h: "Behavior is information",
    p: "Every reaction tells you what your dog needs — we help you read it.",
  },
  {
    h: "Reinforce, don't intimidate",
    p: "No prong, shock, or fear. Methods backed by behavioral science.",
  },
  { h: "Measure, then adjust", p: "Structured logs turn guesswork into a plan you can evaluate." },
  {
    h: "Owner and trainer, aligned",
    p: "One shared source of truth so everyone pulls the same direction.",
  },
];

export function Philosophy() {
  return (
    <section className="bg-slate px-5 py-24 text-cream">
      <div className="mx-auto max-w-5xl">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-bold md:text-4xl">
            Force-free isn't a feature. It's the whole point.
          </h2>
          <p className="mt-4 text-silver">
            TuringCare exists because dogs learn better — and live better — without fear. The
            product is built around methods the science actually supports.
          </p>
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
