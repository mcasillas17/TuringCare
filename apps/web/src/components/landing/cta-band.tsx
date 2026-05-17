import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function CtaBand() {
  return (
    <section className="px-5 py-20">
      <Reveal className="mx-auto max-w-4xl">
        <div
          className="rounded-3xl px-8 py-14 text-center"
          style={{
            background: "linear-gradient(135deg, #d49a4e 0%, #e8b468 100%)",
          }}
        >
          <h2 className="text-3xl font-bold text-slate md:text-4xl">
            Start understanding your dog today
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-slate">
            Free to start. Your journal and first Behavior Brief are ready when
            you are.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 bg-slate px-8 text-cream hover:bg-slate/90"
          >
            <Link to="/register">Create your free account</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
