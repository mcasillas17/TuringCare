import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { useI18n } from "@/i18n";
import { useSignOut } from "@/lib/sign-out";
import { cn } from "@/lib/utils";
import { Link, Outlet } from "react-router-dom";
import { toast } from "sonner";

export function GuidedSetupLayout() {
  const { t } = useI18n();
  const signOutAndNavigate = useSignOut();

  return (
    <div className="min-h-screen bg-cream">
      <header className="flex h-14 items-center justify-between border-b border-silver/60 bg-cream px-4">
        <Link to="/my" aria-label={t("guidedSetup.title")}>
          <BrandMark className="scale-90" />
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const result = await signOutAndNavigate();
              if (result.ok) {
                toast.success(t("app.signedOut"));
              } else {
                toast.error(t("app.signOutFailed"));
              }
            }}
          >
            {t("app.signOut")}
          </Button>
          <LanguageToggle />
        </div>
      </header>
      <VerifyEmailBanner />
      <main className={cn("mx-auto w-full max-w-3xl px-4 py-8 sm:px-6")}>
        <Outlet />
      </main>
    </div>
  );
}
