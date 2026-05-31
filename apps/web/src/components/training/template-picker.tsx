import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useApplyTemplate, useTrainingCatalog } from "@/lib/training-catalog";
import type { CatalogTemplate } from "@turingcare/shared";
import { useState } from "react";
import { toast } from "sonner";

type Props = { dogId: string };

type Phase = { kind: "closed" } | { kind: "open" } | { kind: "preview"; template: CatalogTemplate };

export function TemplatePicker({ dogId }: Props) {
  const { t } = useI18n();
  const { data: catalog } = useTrainingCatalog();
  const apply = useApplyTemplate(dogId);
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });

  if (!catalog) {
    return (
      <Button type="button" variant="outline" disabled>
        {t("training.templatesButton")}
      </Button>
    );
  }

  if (phase.kind === "preview") {
    const template = phase.template;
    return (
      <section className="space-y-3 rounded border border-silver bg-cream p-3">
        <div>
          <div className="font-semibold text-slate">{template.name}</div>
          <p className="text-sm text-slate-soft">{template.description}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate">{t("training.willAdd")}</p>
          <ul className="mt-1 space-y-1 text-sm text-slate">
            {template.skills.map((skill) => (
              <li key={skill.key}>
                <span className="font-medium">{skill.name}</span>
                <span className="text-slate-soft"> — {skill.description}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={apply.isPending}
            onClick={async () => {
              try {
                await apply.mutateAsync(template.key);
                toast.success(t("training.applied"));
                setPhase({ kind: "closed" });
              } catch {
                toast.error(t("training.applyFailed"));
              }
            }}
          >
            {t("training.applyButton")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setPhase({ kind: "open" })}>
            {t("training.cancelButton")}
          </Button>
        </div>
      </section>
    );
  }

  if (phase.kind === "open") {
    return (
      <div className="relative inline-block">
        <Button type="button" variant="outline" onClick={() => setPhase({ kind: "closed" })}>
          {t("training.templatesButton")}
        </Button>
        <ul className="absolute left-0 top-full z-10 mt-1 w-72 space-y-1 rounded border border-silver bg-white p-2 text-sm shadow">
          <li className="px-1 py-1 text-xs font-medium text-slate-soft">
            {t("training.templatesPicking")}
          </li>
          {catalog.map((template) => (
            <li key={template.key}>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-surface-sand"
                onClick={() => setPhase({ kind: "preview", template })}
              >
                <div className="font-medium text-slate">{template.name}</div>
                <div className="text-xs text-slate-soft">{template.description}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Button type="button" variant="outline" onClick={() => setPhase({ kind: "open" })}>
      {t("training.templatesButton")}
    </Button>
  );
}
