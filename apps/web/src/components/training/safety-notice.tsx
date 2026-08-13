import { useI18n } from "@/i18n";
import { REFERRAL_DIRECTORIES, REFERRAL_KEYS, SAFETY_BODY_KEYS } from "@/lib/practice-options";
import type { SuggestionSafety } from "@turingcare/shared";

/**
 * Deliberately has no dismiss control: suppression must not be something an
 * owner can click away to get exercises back.
 */
export function SafetyNotice({ safety }: { safety: SuggestionSafety }) {
  const { t } = useI18n();
  const directories = REFERRAL_DIRECTORIES.filter((entry) =>
    entry.referrals.includes(safety.referral),
  );
  return (
    <section
      className="space-y-3 rounded border border-copper bg-cream p-4"
      role="alert"
      aria-labelledby="safety-notice-title"
    >
      <h2 id="safety-notice-title" className="font-semibold text-slate">
        {t("safety.title")}
      </h2>
      <p className="text-sm text-slate">{t(SAFETY_BODY_KEYS[safety.ruleId])}</p>
      <p className="text-sm text-slate">{t(REFERRAL_KEYS[safety.referral])}</p>
      {directories.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-soft">{t("safety.directoryTitle")}</p>
          <ul className="space-y-1">
            {directories.map((entry) => (
              <li key={entry.href}>
                <a
                  className="text-sm text-copper hover:underline"
                  href={entry.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(entry.labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-soft">{t("safety.keepLogging")}</p>
    </section>
  );
}
