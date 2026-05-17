import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function Hero() {
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
            Force-free · Science-based
          </span>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate md:text-6xl">
            Understand your dog.
            <br />
            <span className="underline decoration-copper decoration-[6px] underline-offset-4">
              Train without force.
            </span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-soft">
            TuringCare helps puppy owners and new adopters keep a structured
            behavior journal — then turns it into a shareable Behavior Brief your
            force-free trainer can actually use.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-slate px-7 text-cream hover:bg-slate/90"
            >
              <Link to="/register">Get started — it's free</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-slate/20 text-slate hover:bg-surface-sand"
            >
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </Reveal>
        <Reveal delay={320}>
          <p className="mt-6 text-sm text-slate-soft/80">
            Built by dog people — and named after Turing, a blue-merle Mini
            American Shepherd. 🐾
          </p>
        </Reveal>
      </div>
    </section>
  );
}
