import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="bg-slate px-5 py-12 text-silver">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
        <div>
          <p className="text-lg font-bold text-cream">TuringCare</p>
          <p className="mt-1 text-sm">Humane, force-free dog training support.</p>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
        >
          <a href="#how" className="hover:text-gold">How it works</a>
          <a href="#brief" className="hover:text-gold">Behavior Brief</a>
          <a href="#faq" className="hover:text-gold">FAQ</a>
          <Link to="/login" className="hover:text-gold">Log in</Link>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl border-t border-white/10 pt-6 text-center text-xs text-silver/70 md:text-left">
        © {new Date().getFullYear()} TuringCare · Built for Turing 🐾
      </p>
    </footer>
  );
}
