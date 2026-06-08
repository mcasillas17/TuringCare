import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

type Props = {
  rangeLabel: string;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onThisWeek: () => void;
};

export function WeekNav({ rangeLabel, canGoNext, onPrev, onNext, onThisWeek }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="outline" aria-label={t("week.prevWeek")} onClick={onPrev}>
        ◀
      </Button>
      <button
        type="button"
        onClick={onThisWeek}
        className="text-sm font-medium text-slate hover:underline"
      >
        {rangeLabel}
      </button>
      <Button
        type="button"
        variant="outline"
        aria-label={t("week.nextWeek")}
        onClick={onNext}
        disabled={!canGoNext}
      >
        ▶
      </Button>
    </div>
  );
}
