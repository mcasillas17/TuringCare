import { useI18n } from "@/i18n";

export function Privacy() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-cream text-slate">
      <div className="mx-auto max-w-2xl space-y-4 p-8">
        <h1 className="text-3xl font-bold text-slate">{t("privacy.title")}</h1>
        <p className="text-sm text-slate-soft">{t("privacy.intro")}</p>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate">{t("privacy.h_account")}</h2>
          <p className="text-sm">{t("privacy.p_account")}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate">{t("privacy.h_dogs")}</h2>
          <p className="text-sm">{t("privacy.p_dogs")}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate">{t("privacy.h_emails")}</h2>
          <p className="text-sm">{t("privacy.p_emails")}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate">{t("privacy.h_retention")}</h2>
          <p className="text-sm">{t("privacy.p_retention")}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate">{t("privacy.h_contact")}</h2>
          <p className="text-sm">{t("privacy.p_contact")}</p>
        </section>
      </div>
    </div>
  );
}
