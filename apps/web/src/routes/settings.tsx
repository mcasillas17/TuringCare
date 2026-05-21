import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { signOut } from "@/lib/auth-client";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function Settings() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold text-slate">{t("settings.title")}</h1>
      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("settings.language")}</h2>
        <LanguageToggle />
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("settings.account")}</h2>
        <Link to="/my/profile" className="block underline">
          {t("settings.editProfile")}
        </Link>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            toast.success(t("app.signedOut"));
            navigate("/login");
          }}
        >
          {t("settings.signOut")}
        </Button>
      </section>
    </div>
  );
}
