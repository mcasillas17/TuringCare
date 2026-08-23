import { useI18n } from "@/i18n";
import { Link } from "react-router-dom";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="bg-slate px-5 py-12 text-silver">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
        <div>
          <p className="text-lg font-bold text-cream">{t("footer.brand")}</p>
          <p className="mt-1 text-sm">{t("footer.tagline")}</p>
        </div>
        <nav
          aria-label={t("footer.navLabel")}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
        >
          <a href="#how" className="hover:text-gold">
            {t("footer.navHow")}
          </a>
          <a href="#brief" className="hover:text-gold">
            {t("footer.navBrief")}
          </a>
          <a href="#faq" className="hover:text-gold">
            {t("footer.navFaq")}
          </a>
          <Link to="/privacy" className="hover:text-gold">
            {t("footer.privacy")}
          </Link>
          <Link to="/terms" className="hover:text-gold">
            {t("footer.terms")}
          </Link>
          <a
            href="mailto:feedback@turingcare.dog?subject=TuringCare%20feedback"
            className="hover:text-gold"
          >
            {t("footer.feedback")}
          </a>
        </nav>
      </div>
      <p className="mx-auto mt-8 flex max-w-6xl items-center justify-center gap-2 border-t border-white/10 pt-6 text-center text-xs text-silver/70 md:justify-start md:text-left">
        <img
          src="/turing.jpg"
          alt={t("hero.turingAlt")}
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          className="size-5 rounded-full object-cover"
        />
        © {new Date().getFullYear()} TuringCare · {t("footer.builtFor")}
      </p>
    </footer>
  );
}
