import { Reveal } from "./reveal";

const TAGS = [
  "Force-free",
  "Fear-Free certified",
  "CCPDT",
  "Positive reinforcement",
  "Separation anxiety",
  "Reactive dogs",
  "Puppy foundations",
];

export function TrainersTeaser() {
  return (
    <section id="trainers" className="bg-cream px-5 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <Reveal>
          <span className="inline-block rounded-full bg-ice/20 px-3 py-1 text-xs font-semibold tracking-wide text-slate uppercase">
            Coming soon
          </span>
          <h2 className="mt-5 text-3xl font-bold text-slate md:text-4xl">
            Find a force-free trainer who fits
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-soft">
            A curated directory of science-based trainers — filterable by methodology, certification
            and specialty — is on the way. Your Behavior Brief will plug straight into it.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-9 flex flex-wrap justify-center gap-2.5">
            {TAGS.map((t) => (
              <span
                key={t}
                className="rounded-full border border-silver bg-surface px-4 py-1.5 text-sm text-slate-soft"
              >
                {t}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
