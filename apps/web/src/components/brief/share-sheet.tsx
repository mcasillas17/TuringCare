import { SendPanel } from "@/components/brief/send-panel";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { useFinalizeBrief, useRevokeShare, useShareBrief } from "@/lib/brief";
import type { DogForPdf } from "@/lib/brief-pdf-model";
import { Suspense, lazy, useState } from "react";
import { toast } from "sonner";

const BriefDownloadButton = lazy(() => import("@/components/brief-download-button"));

type BriefLike = {
  status: "draft" | "finalized";
  version: number;
  summary: string;
  generatedAt: string;
  shareToken?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  dogId: string;
  dogName: string;
  dog?: DogForPdf | null;
  brief: BriefLike;
  initialRecipient?: string;
};

type Panel = "menu" | "email" | "link";

export function BriefShareSheet({
  open,
  onClose,
  dogId,
  dogName,
  dog,
  brief,
  initialRecipient,
}: Props) {
  const { t } = useI18n();
  const fin = useFinalizeBrief(dogId);
  const share = useShareBrief(dogId);
  const revoke = useRevokeShare(dogId);
  const [panel, setPanel] = useState<Panel>("menu");
  const token = brief.shareToken;
  const shareUrl = token ? `${window.location.origin}/b/${token}` : null;

  const ensureFinalized = async () => {
    if (brief.status !== "finalized") await fin.mutateAsync();
  };

  const openEmail = async () => {
    try {
      await ensureFinalized();
      setPanel("email");
    } catch {
      toast.error(t("brief.genFailed"));
    }
  };

  const openLink = async () => {
    try {
      await ensureFinalized();
      if (!shareUrl) {
        await share.mutateAsync();
      }
      setPanel("link");
    } catch {
      toast.error(t("brief.shareFailed"));
    }
  };

  const tile =
    "flex w-full items-center gap-3 rounded-xl border border-silver bg-white p-4 text-left";
  // Separate primary class — never combine bg-white + bg-slate (Tailwind resolves
  // conflicting bg-* by stylesheet order, which made the dark tile render white).
  const tilePrimary =
    "flex w-full items-center gap-3 rounded-xl border border-slate bg-slate p-4 text-left text-cream";

  const close = () => {
    setPanel("menu");
    onClose();
  };

  return (
    <Sheet
      open={open}
      title={t("brief.shareHeading", { name: dogName })}
      closeLabel={t("journal.closeSheet")}
      onClose={close}
    >
      {panel !== "menu" && (
        <button
          type="button"
          className="mb-3 text-sm font-medium text-slate-soft"
          onClick={() => setPanel("menu")}
        >
          ‹ {t("brief.backToBrief")}
        </button>
      )}

      {panel === "menu" && (
        <div className="space-y-3">
          <p className="rounded-lg border border-copper/40 bg-copper/10 p-3 text-sm text-slate">
            {t("brief.finalizeShareNote", { version: brief.version })}
          </p>
          <button type="button" className={tilePrimary} onClick={() => void openEmail()}>
            <span className="text-xl">✉️</span>
            <span>
              <span className="block font-semibold">{t("brief.shareEmailTitle")}</span>
              <span className="block text-xs text-cream/80">{t("brief.shareEmailDesc")}</span>
            </span>
          </button>
          <button type="button" className={tile} onClick={() => void openLink()}>
            <span className="text-xl">🔗</span>
            <span>
              <span className="block font-semibold text-slate">{t("brief.shareLinkTitle")}</span>
              <span className="block text-xs text-slate-soft">{t("brief.shareLinkDesc")}</span>
            </span>
          </button>
          <div className={tile}>
            <span className="text-xl">⬇️</span>
            <span className="flex-1">
              <span className="block font-semibold text-slate">{t("brief.sharePdfTitle")}</span>
              <span className="block text-xs text-slate-soft">{t("brief.sharePdfDesc")}</span>
              <span className="mt-2 block">
                <Suspense
                  fallback={
                    <Button variant="outline" disabled>
                      {t("brief.preparingPdf")}
                    </Button>
                  }
                >
                  <BriefDownloadButton brief={brief} dog={dog ?? undefined} />
                </Suspense>
              </span>
            </span>
          </div>
        </div>
      )}

      {panel === "email" && (
        <SendPanel dogId={dogId} briefStatus="finalized" initialRecipient={initialRecipient} />
      )}

      {panel === "link" && (
        <div className="space-y-3">
          {shareUrl ? (
            <>
              <input
                readOnly
                aria-label={t("brief.share")}
                value={shareUrl}
                className="w-full rounded border border-silver bg-white px-2 py-2 text-sm"
              />
              <div className="flex gap-2">
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
                      setPanel("menu");
                    } catch {
                      toast.error(t("brief.shareFailed"));
                    }
                  }}
                >
                  {t("brief.stopSharing")}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-soft">{t("brief.generating")}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
