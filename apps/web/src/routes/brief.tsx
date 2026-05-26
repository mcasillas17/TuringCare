import { SendPanel } from "@/components/brief/send-panel";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  useBrief,
  useFinalizeBrief,
  useGenerateBrief,
  useRevokeShare,
  useShareBrief,
} from "@/lib/brief";
import { useDogs } from "@/lib/dogs";
import { type BriefWindow, briefWindows } from "@turingcare/shared";
import { Suspense, lazy, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

// Lazy-load so the heavy @react-pdf/renderer bundle is code-split out of the
// main app chunk and only fetched when a brief is shown.
const BriefDownloadButton = lazy(() => import("@/components/brief-download-button"));

export function Brief() {
  const { t, locale } = useI18n();
  const { id: routeId } = useParams();
  const [params] = useSearchParams();
  const recipientParam = params.get("recipient") ?? undefined;
  const { data: dogs } = useDogs();
  const [picked, setPicked] = useState("");
  const dogId = routeId ?? picked ?? "";
  const [windowChoice, setWindowChoice] = useState<BriefWindow>("30d");
  const { data: brief, isError } = useBrief(dogId);
  const dog = dogs?.find((d) => d.id === dogId);
  const gen = useGenerateBrief(dogId);
  const fin = useFinalizeBrief(dogId);
  const share = useShareBrief(dogId);
  const revoke = useRevokeShare(dogId);
  const shareUrl = brief?.shareToken ? `${window.location.origin}/b/${brief.shareToken}` : null;

  const windowLabels: Record<BriefWindow, string> = {
    "7d": t("brief.window7d"),
    "30d": t("brief.window30d"),
    "90d": t("brief.window90d"),
    all: t("brief.windowAll"),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("brief.title")}</h1>
      {!routeId && (
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("brief.pickDog")}</span>
          <select
            className="w-full rounded border border-silver bg-white px-3 py-2 text-sm"
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
          >
            <option value="">—</option>
            {dogs?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {dogId && (
        <>
          <fieldset className="m-0 min-w-0 space-y-1 border-0 p-0">
            <legend className="p-0 text-sm font-medium text-slate">{t("brief.windowLabel")}</legend>
            <div className="flex flex-wrap items-center gap-2">
              {briefWindows.map((w) => (
                <Button
                  key={w}
                  type="button"
                  variant={windowChoice === w ? "default" : "outline"}
                  onClick={() => setWindowChoice(w)}
                >
                  {windowLabels[w]}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={gen.isPending}
              onClick={async () => {
                try {
                  await gen.mutateAsync(windowChoice);
                  toast.success(t("brief.title"));
                } catch {
                  toast.error(t("brief.genFailed"));
                }
              }}
              className="bg-slate text-cream"
            >
              {gen.isPending
                ? t("brief.generating")
                : brief
                  ? t("brief.regenerate")
                  : t("brief.generate")}
            </Button>
            {brief && brief.status !== "finalized" && (
              <Button variant="outline" onClick={() => fin.mutate()}>
                {t("brief.finalize")}
              </Button>
            )}
            {brief && (
              <>
                <Button variant="outline" onClick={() => window.print()}>
                  {t("brief.print")}
                </Button>
                <Suspense
                  fallback={
                    <Button variant="outline" disabled>
                      {t("brief.preparingPdf")}
                    </Button>
                  }
                >
                  <BriefDownloadButton brief={brief} dog={dog} />
                </Suspense>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(brief.summary);
                      toast.success(t("brief.copied"));
                    } catch {
                      toast.error(t("brief.genFailed"));
                    }
                  }}
                >
                  {t("brief.copy")}
                </Button>
                {shareUrl ? (
                  <>
                    <input
                      readOnly
                      aria-label={t("brief.share")}
                      value={shareUrl}
                      className="w-64 rounded border border-silver bg-white px-2 py-1 text-sm"
                    />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl);
                          toast.success(t("brief.linkCopied"));
                        } catch {
                          toast.error(t("brief.shareFailed"));
                        }
                      }}
                    >
                      {t("brief.copyLink")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={revoke.isPending}
                      onClick={async () => {
                        try {
                          await revoke.mutateAsync();
                        } catch {
                          toast.error(t("brief.shareFailed"));
                        }
                      }}
                    >
                      {t("brief.stopSharing")}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    disabled={share.isPending}
                    onClick={async () => {
                      try {
                        await share.mutateAsync();
                      } catch {
                        toast.error(t("brief.shareFailed"));
                      }
                    }}
                  >
                    {t("brief.createShareLink")}
                  </Button>
                )}
              </>
            )}
          </div>
          {isError && <p className="text-red-600">{t("brief.loadError")}</p>}
          {!brief && !isError && (
            <section className="space-y-2 rounded border border-silver bg-white p-6 text-center">
              <h2 className="text-lg font-semibold text-slate">{t("brief.emptyTitle")}</h2>
              <p className="text-slate-soft">{t("brief.emptyBodyWithEntries")}</p>
            </section>
          )}
          {brief && (
            <article className="brief-print whitespace-pre-wrap rounded border border-silver bg-white p-4 text-sm text-slate">
              <div className="mb-2 font-semibold text-copper">
                {t("brief.version")} {brief.version} ·{" "}
                {brief.status === "finalized" ? t("brief.finalized") : t("brief.draft")}
              </div>
              {brief.summary}
            </article>
          )}
          <SendPanel
            dogId={dogId}
            briefStatus={brief?.status ?? null}
            initialRecipient={recipientParam}
          />
        </>
      )}
    </div>
  );
}
