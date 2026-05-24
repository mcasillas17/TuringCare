import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { Link } from "react-router-dom";

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-cream text-slate">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-8 text-center">
        <h1 className="text-3xl font-bold text-slate">{t("notFound.title")}</h1>
        <p className="text-sm text-slate-soft">{t("notFound.body")}</p>
        <Button asChild>
          <Link to="/">{t("notFound.home")}</Link>
        </Button>
      </div>
    </div>
  );
}
