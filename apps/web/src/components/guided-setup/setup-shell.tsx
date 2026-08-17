import { useI18n } from "@/i18n";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

type SetupShellProps = {
  step: 1 | 2 | 3;
  title: string;
  description?: string;
  children: ReactNode;
};

export function SetupShell({ step, title, description, children }: SetupShellProps) {
  const { t } = useI18n();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step > 0) headingRef.current?.focus();
  }, [step]);

  return (
    <section
      aria-labelledby="guided-setup-heading"
      className="motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none"
    >
      <div className="mb-8 space-y-2">
        <p className="text-sm font-semibold text-copper">
          {t("guidedSetup.stepOfThree", { step })}
        </p>
        <output aria-live="polite" className="sr-only">
          {t("guidedSetup.stepAnnouncement", { step })}
        </output>
        <h1
          id="guided-setup-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-bold tracking-tight text-slate focus:outline-none"
        >
          {title}
        </h1>
        {description && <p className="max-w-xl text-slate-soft">{description}</p>}
      </div>
      {children}
    </section>
  );
}
