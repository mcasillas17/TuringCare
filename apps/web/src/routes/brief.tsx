import { BriefShareSheet } from "@/components/brief/share-sheet";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useBrief, useGenerateBrief } from "@/lib/brief";
import { briefGeneratedLabel, briefStatusLabel, briefTitle } from "@/lib/brief-chrome";
import { useDogs } from "@/lib/dogs";
import { type BriefWindow, briefWindows } from "@turingcare/shared";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export function Brief() {
  const { t } = useI18n();
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
  const [shareOpen, setShareOpen] = useState(false);

  // On the global brief route, default to the first dog so the screen lands on
  // the brief itself instead of an empty dog picker.
  useEffect(() => {
    if (routeId || picked) return;
    const first = dogs?.[0];
    if (first) setPicked(first.id);
  }, [routeId, picked, dogs]);

  const windowLabels: Record<BriefWindow, string> = {
    "7d": t("brief.window7d"),
    "30d": t("brief.window30d"),
    "90d": t("brief.window90d"),
    all: t("brief.windowAll"),
  };

  const generatedOn = brief ? briefGeneratedLabel(brief.generatedAt, brief.locale) : "";
  const statusLabel = brief ? briefStatusLabel(brief.status, brief.version, brief.locale) : "";

  const regenerate = async (w: BriefWindow) => {
    setWindowChoice(w);
    try {
      await gen.mutateAsync(w);
    } catch {
      toast.error(t("brief.genFailed"));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {!routeId && (dogs?.length ?? 0) > 1 && (
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
                  disabled={gen.isPending}
                  onClick={() => regenerate(w)}
                >
                  {windowLabels[w]}
                </Button>
              ))}
            </div>
          </fieldset>

          {!brief && (
            <Button
              disabled={gen.isPending}
              onClick={() => regenerate(windowChoice)}
              className="bg-slate text-cream"
            >
              {gen.isPending ? t("brief.generating") : t("brief.generate")}
            </Button>
          )}

          {isError && <p className="text-red-600">{t("brief.loadError")}</p>}

          {!brief && !isError && (
            <section className="space-y-2 rounded-xl border border-silver bg-white p-6 text-center">
              <h2 className="text-lg font-semibold text-slate">{t("brief.emptyTitle")}</h2>
              <p className="text-slate-soft">{t("brief.emptyBodyWithEntries")}</p>
            </section>
          )}

          {brief && (
            <>
              <article className="brief-print overflow-hidden rounded-xl border border-silver bg-white text-sm text-slate">
                <header className="flex items-center justify-between border-b-2 border-copper px-5 py-3">
                  <span className="text-lg font-bold text-slate">
                    Turing<span className="text-copper">Care</span>
                  </span>
                  <span className="text-xs uppercase tracking-wide text-slate-soft">
                    {briefTitle(brief.locale)}
                  </span>
                </header>
                <div className="space-y-3 p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate">{dog?.name}</h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${brief.status === "finalized" ? "bg-green-100 text-green-800" : "bg-slate/5 text-slate-soft"}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-slate">{brief.summary}</p>
                  {generatedOn && (
                    <p className="border-t border-silver pt-3 text-xs text-slate-soft">
                      {generatedOn}
                    </p>
                  )}
                </div>
              </article>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setShareOpen(true)} className="bg-slate text-cream">
                  {t("brief.shareThisBrief")} ▸
                </Button>
                <Button
                  variant="outline"
                  disabled={gen.isPending}
                  onClick={() => regenerate(windowChoice)}
                >
                  {t("brief.regenerate")}
                </Button>
              </div>

              <BriefShareSheet
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                dogId={dogId}
                dogName={dog?.name ?? ""}
                dog={dog}
                brief={brief}
                initialRecipient={recipientParam}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
