import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useValidationMessage } from "@/i18n/validation";
import { BriefRequestError, briefSendErrorMessageKey } from "@/lib/brief-errors";
import { createBriefSendIdempotencyKey } from "@/lib/brief-idempotency";
import { useBriefSends, useSendBrief } from "@/lib/brief-send";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDate } from "@turingcare/i18n";
import { type BriefSendIntent, briefSendIntentSchema } from "@turingcare/shared";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const inputCls = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function SendPanel({
  dogId,
  briefId,
  briefStatus,
  initialRecipient,
}: {
  dogId: string;
  briefId: string;
  briefStatus: "draft" | "finalized" | null;
  initialRecipient?: string;
}) {
  const { t, locale } = useI18n();
  const validationMessage = useValidationMessage();
  const send = useSendBrief(dogId);
  const submission = useRef<{ intent: string; idempotencyKey: string } | undefined>(undefined);
  const {
    data: sends,
    isError: sendsError,
    isFetching: sendsFetching,
    isLoading: sendsLoading,
    refetch: refetchSends,
  } = useBriefSends(dogId);
  const sendHistoryReady = sends !== undefined && !sendsFetching && !sendsError;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BriefSendIntent>({
    resolver: zodResolver(briefSendIntentSchema),
    defaultValues: { recipient: initialRecipient ?? "" },
  });

  // If the prop changes (e.g. owner navigates between trainer-detail pages
  // without unmounting Brief), pick it up. Guarded so we never clobber a
  // value the user is mid-typing.
  useEffect(() => {
    if (initialRecipient) reset({ recipient: initialRecipient });
  }, [initialRecipient, reset]);

  if (briefStatus === null) return null;

  const onSubmit = handleSubmit(async (v) => {
    // The history is the durable source of pending idempotency keys. Never
    // mint a replacement key until that recovery read has succeeded.
    if (!sendHistoryReady) return;
    try {
      const intent = JSON.stringify([briefId, v.recipient, v.message ?? null]);
      if (submission.current?.intent !== intent) {
        const recoverable = sends?.find(
          (candidate) =>
            candidate.status === "pending" &&
            candidate.briefId === briefId &&
            JSON.stringify([candidate.briefId, candidate.recipient, candidate.message ?? null]) ===
              intent,
        );
        submission.current = {
          intent,
          idempotencyKey: recoverable?.id ?? createBriefSendIdempotencyKey(),
        };
      }
      await send.mutateAsync({
        ...v,
        briefId,
        idempotencyKey: submission.current.idempotencyKey,
      });
      submission.current = undefined;
      toast.success(t("briefSend.sent"));
      reset();
    } catch (error) {
      if (error instanceof BriefRequestError && error.code === "idempotency_conflict") {
        submission.current = undefined;
      }
      toast.error(t(briefSendErrorMessageKey(error)));
    }
  });

  const retryPendingSend = async (pending: NonNullable<typeof sends>[number]) => {
    try {
      await send.mutateAsync({
        briefId: pending.briefId,
        recipient: pending.recipient,
        message: pending.message,
        idempotencyKey: pending.id,
      });
      toast.success(t("briefSend.sent"));
    } catch (error) {
      toast.error(t(briefSendErrorMessageKey(error)));
    }
  };

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
            <span className="text-xs text-red-600">
              {validationMessage(errors.recipient.message)}
            </span>
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
          {errors.message && (
            <span className="text-xs text-red-600">
              {validationMessage(errors.message.message)}
            </span>
          )}
        </label>

        <Button
          type="submit"
          disabled={isSubmitting || !sendHistoryReady}
          className="w-full bg-slate text-cream"
        >
          {isSubmitting ? t("briefSend.sending") : t("briefSend.send")}
        </Button>
      </form>

      {(sendsLoading || (sendsFetching && !sendsError)) && (
        <output className="text-sm text-slate-soft">{t("briefSend.historyLoading")}</output>
      )}
      {sendsError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 text-sm text-slate-soft"
        >
          <span>{t("briefSend.historyLoadFailed")}</span>
          <Button type="button" variant="outline" onClick={() => void refetchSends()}>
            {t("briefSend.retry")}
          </Button>
        </div>
      )}

      {sends && sends.length > 0 && (
        <div className="border-t border-silver pt-3">
          <h3 className="mb-2 text-sm font-medium text-slate">{t("briefSend.historyTitle")}</h3>
          <ul className="space-y-1">
            {sends.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-soft">
                  {s.recipient} —{" "}
                  {s.status === "pending"
                    ? t("briefSend.deliveryPending")
                    : (formatDate(locale, String(s.sentAt), { dateStyle: "medium" }) ??
                      t("common.unavailable"))}
                </span>
                {s.status === "pending" && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={send.isPending}
                    onClick={() => void retryPendingSend(s)}
                  >
                    {send.isPending ? t("briefSend.retrying") : t("briefSend.retry")}
                  </Button>
                )}
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
