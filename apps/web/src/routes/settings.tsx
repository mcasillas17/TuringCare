import { LanguageToggle } from "@/components/LanguageToggle";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";
import { useTuring } from "@/components/turing/turing-context";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useSignOut } from "@/lib/sign-out";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export function Settings() {
  const { t } = useI18n();
  const signOutAndNavigate = useSignOut();
  const { hidden, setHidden } = useTuring();
  return (
    <div className="mx-auto max-w-md space-y-8">
      <h1 className="text-2xl font-bold text-slate">{t("settings.title")}</h1>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("settings.language")}</h2>
        <LanguageToggle />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("settings.companion")}</h2>
        <label className="flex items-center gap-2 text-slate">
          <input type="checkbox" checked={!hidden} onChange={(e) => setHidden(!e.target.checked)} />
          {t("settings.showTuring")}
        </label>
        <p className="text-sm text-slate-soft">{t("settings.showTuringHint")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("settings.account")}</h2>
        <Link to="/my/profile" className="block underline">
          {t("settings.editProfile")}
        </Link>
        <a
          href="mailto:feedback@turingcare.dog?subject=TuringCare%20feedback"
          className="block underline"
        >
          {t("footer.feedback")}
        </a>
        <Button
          variant="outline"
          onClick={async () => {
            const result = await signOutAndNavigate();
            if (result.ok) toast.success(t("app.signedOut"));
          }}
        >
          {t("settings.signOut")}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("settings.changePassword")}</h2>
        <ChangePasswordForm />
      </section>

      <section className="space-y-2 border-t border-silver pt-6">
        <h2 className="font-semibold text-red-700">{t("settings.dangerZone")}</h2>
        <p className="text-sm text-slate-soft">{t("settings.deleteAccountIntro")}</p>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
