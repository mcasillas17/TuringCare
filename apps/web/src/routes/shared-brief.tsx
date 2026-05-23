import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useSharedBrief } from "@/lib/shared-brief";
import { Suspense, lazy } from "react";
import { useParams } from "react-router-dom";

const BriefDownloadButton = lazy(() => import("@/components/brief-download-button"));

export function SharedBrief() {
  const { t } = useI18n();
  const { token } = useParams();
  const { data, isPending, isError } = useSharedBrief(token ?? "");

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex justify-center">
        <BrandMark />
      </div>
      {isPending ? (
        <p className="p-4 text-slate-soft">{t("common.loading")}</p>
      ) : isError || !data ? (
        <p className="p-4 text-slate-soft">{t("brief.shareUnavailable")}</p>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-slate">{t("brief.sharedTitle")}</h1>
          <div className="flex flex-wrap gap-2">
            <Suspense
              fallback={
                <Button variant="outline" disabled>
                  {t("brief.preparingPdf")}
                </Button>
              }
            >
              <BriefDownloadButton
                brief={{
                  summary: data.narrative ?? data.summary,
                  status: data.status,
                  version: data.version,
                  generatedAt: data.generatedAt,
                }}
                dog={{ name: data.dogName }}
              />
            </Suspense>
          </div>
          <article className="brief-print whitespace-pre-wrap rounded border border-silver bg-white p-4 text-sm text-slate">
            <div className="mb-2 font-semibold text-copper">
              {t("brief.version")} {data.version}
            </div>
            {data.narrative ?? data.summary}
          </article>
        </>
      )}
    </div>
  );
}
