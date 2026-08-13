import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useLogSession } from "@/lib/progress";
import { zodResolver } from "@hookform/resolvers/zod";
import { type PracticeSessionInput, practiceSessionSchema } from "@turingcare/shared";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

function localDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SessionForm({
  dogId,
  skillId,
  onCancel,
  onSaved,
}: {
  dogId: string;
  skillId: string;
  onCancel: () => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const logSession = useLogSession(dogId);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PracticeSessionInput>({
    resolver: zodResolver(practiceSessionSchema),
    defaultValues: { occurredAt: localDateTime() },
  });

  const onSubmit = handleSubmit(async (body) => {
    try {
      const occurredAt = new Date(body.occurredAt);
      await logSession.mutateAsync({
        skillId,
        body: {
          ...body,
          occurredAt: occurredAt.toISOString(),
          timezoneOffsetMinutes: occurredAt.getTimezoneOffset(),
        },
      });
      toast.success(t("progress.saved"));
      onSaved?.();
    } catch {
      toast.error(t("progress.saveFailed"));
    }
  });

  return (
    <form
      className="space-y-3 rounded border border-silver bg-cream p-3"
      onSubmit={(event) => {
        event.stopPropagation();
        onSubmit();
      }}
    >
      <label className="block">
        <span className="text-sm">{t("progress.occurredAt")}</span>
        <input
          type="datetime-local"
          max={localDateTime()}
          className={input}
          {...register("occurredAt")}
        />
        {errors.occurredAt && (
          <span className="text-xs text-red-600">{errors.occurredAt.message}</span>
        )}
      </label>
      <label className="block">
        <span className="text-sm">{t("progress.duration")}</span>
        <input
          type="number"
          min={0}
          className={input}
          placeholder={t("progress.durationOptional")}
          {...register("durationMinutes", {
            setValueAs: (v) =>
              v === "" || v == null || Number.isNaN(Number(v)) ? undefined : Number(v),
          })}
        />
      </label>
      <label className="block">
        <span className="text-sm">{t("progress.notes")}</span>
        <textarea
          rows={2}
          className={input}
          placeholder={t("progress.notesOptional")}
          {...register("notes", { setValueAs: (v) => v || undefined })}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting || logSession.isPending}>
          {isSubmitting || logSession.isPending ? t("progress.saving") : t("progress.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("progress.cancel")}
        </Button>
      </div>
    </form>
  );
}
