import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useUpdateSkillConfidence } from "@/lib/progress";
import { useState } from "react";

type ConfidenceLevel = 1 | 2 | 3 | 4 | 5;

const levels: Array<{
  value: ConfidenceLevel;
  key: Parameters<ReturnType<typeof useI18n>["t"]>[0];
}> = [
  { value: 1, key: "progress.level1" },
  { value: 2, key: "progress.level2" },
  { value: 3, key: "progress.level3" },
  { value: 4, key: "progress.level4" },
  { value: 5, key: "progress.level5" },
];

export function ConfidenceChip({
  dogId,
  skillId,
  confidence,
}: {
  dogId: string;
  skillId: string;
  confidence: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const update = useUpdateSkillConfidence(dogId);

  return (
    <div className="relative inline-flex">
      <Button
        type="button"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        {confidence}/5
      </Button>
      {open && (
        <div className="absolute top-9 right-0 z-10 w-40 rounded border border-silver bg-white p-1 shadow">
          {levels.map((level) => (
            <Button
              key={level.value}
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={(event) => {
                event.stopPropagation();
                update.mutate({ skillId, body: { confidence: level.value } });
                setOpen(false);
              }}
            >
              {t(level.key)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
