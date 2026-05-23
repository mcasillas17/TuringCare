import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useBriefSends, useSendBrief } from "@/lib/brief-send";
import { zodResolver } from "@hookform/resolvers/zod";
import { type BriefSendInput, briefSendSchema } from "@turingcare/shared";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const inputCls = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function SendPanel({
  dogId,
  briefStatus,
}: {
  dogId: string;
  briefStatus: "draft" | "finalized" | null;
}) {
  const { t, locale } = useI18n();
  const send = useSendBrief(dogId);
  const { data: sends } = useBriefSends(dogId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BriefSendInput>({
    resolver: zodResolver(briefSendSchema),
  });

  if (briefStatus === null) return null;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await send.mutateAsync(v);
      toast.success(t("briefSend.sent"));
      reset();
    } catch {
      toast.error(t("briefSend.sendFailed"));
    }
  });

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <h2 className="font-semibold text-slate">{t("briefSend.title")}</h2>

      <form onSubmit={onSubmit} noValidate className="space-y-3">
        <label className="block">
          <span className="text-sm">{t("briefSend.recipient")}</span>
          <input
            type="email"
            className={inputCls}
            placeholder={t("briefSend.recipientPh")}
            {...register("recipient")}
          />
          {errors.recipient && (
            <span className="text-xs text-red-600">{errors.recipient.message}</span>
          )}
        </label>
        <label className="block">
          <span className="text-sm">
            {t("briefSend.message")}{" "}
            <span className="text-slate-soft">({t("briefSend.messageOptional")})</span>
          </span>
          <textarea
            rows={3}
            className={inputCls}
            placeholder={t("briefSend.messagePh")}
            {...register("message", { setValueAs: (v) => v || undefined })}
          />
          {errors.message && <span className="text-xs text-red-600">{errors.message.message}</span>}
        </label>

        {briefStatus === "finalized" ? (
          <Button type="submit" disabled={isSubmitting} className="bg-slate text-cream">
            {isSubmitting ? t("briefSend.sending") : t("briefSend.send")}
          </Button>
        ) : (
          <p className="text-sm text-slate-soft">ⓘ {t("briefSend.needsFinalized")}</p>
        )}
      </form>

      {sends && sends.length > 0 && (
        <div className="border-t border-silver pt-3">
          <h3 className="mb-2 text-sm font-medium text-slate">{t("briefSend.historyTitle")}</h3>
          <ul className="space-y-1">
            {sends.map((s) => (
              <li key={s.id} className="text-sm text-slate-soft">
                {s.recipient} — {fmt.format(new Date(String(s.sentAt)))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sends && sends.length === 0 && (
        <p className="border-t border-silver pt-3 text-sm text-slate-soft">
          {t("briefSend.historyEmpty")}
        </p>
      )}
    </section>
  );
}
