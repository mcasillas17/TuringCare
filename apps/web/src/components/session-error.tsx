import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useSession } from "@/lib/auth-client";
import { useState } from "react";

export function SessionError() {
  const { t } = useI18n();
  const { refetch } = useSession();
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="space-y-4 p-8" role="alert">
      <p>{t("verification.sessionError")}</p>
      <Button
        disabled={retrying}
        aria-busy={retrying}
        onClick={async () => {
          setRetrying(true);
          try {
            await refetch({ query: { disableCookieCache: true } });
          } catch {
            // Keep the existing localized recovery message and allow another try.
          } finally {
            setRetrying(false);
          }
        }}
      >
        {t("verification.retry")}
      </Button>
    </div>
  );
}
