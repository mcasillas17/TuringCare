import { useI18n } from "@/i18n";

export function Terms() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-cream text-slate">
      <div className="mx-auto max-w-2xl space-y-4 p-8">
        <h1 className="text-3xl font-bold text-slate">{t("terms.title")}</h1>
        <p className="text-sm text-slate-soft">{t("terms.intro")}</p>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate">{t("terms.h_beta")}</h2>
          <p className="text-sm">{t("terms.p_beta")}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate">{t("terms.h_use")}</h2>
          <p className="text-sm">{t("terms.p_use")}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate">{t("terms.h_liability")}</h2>
          <p className="text-sm">{t("terms.p_liability")}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate">{t("terms.h_changes")}</h2>
          <p className="text-sm">{t("terms.p_changes")}</p>
        </section>
      </div>
    </div>
  );
}
