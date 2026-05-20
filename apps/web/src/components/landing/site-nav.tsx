import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export function SiteNav() {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const LINKS = [
    { href: "#how", label: t("nav.howItWorks") },
    { href: "#brief", label: t("nav.brief") },
    { href: "#trainers", label: t("nav.trainers") },
    { href: "#faq", label: t("nav.faq") },
  ];

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled ? "bg-cream/85 backdrop-blur border-b border-silver/60" : "bg-transparent",
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"
      >
        <a href="#top" className="flex items-center gap-2 font-bold text-slate">
          <BrandMark />
        </a>
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-slate-soft underline-offset-4 transition-colors hover:text-slate hover:underline hover:decoration-copper"
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Button asChild variant="ghost" className="text-slate hover:bg-surface-sand">
            <Link to="/login">{t("nav.login")}</Link>
          </Button>
          <Button asChild className="bg-slate text-cream hover:bg-slate/90">
            <Link to="/register">{t("nav.getStarted")}</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
