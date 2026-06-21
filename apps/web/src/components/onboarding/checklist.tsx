import { useTuring } from "@/components/turing/turing-context";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type OnboardingStatus, useOnboardingStatus } from "@/lib/onboarding";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const DISMISSED_KEY = "turingcare.onboarding.celebrationDismissed";

type ItemKey = "addDog" | "logMoments" | "setGoal" | "finalizeBrief" | "shareWithTrainer";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "true");
  } catch {
    // Storage may be unavailable (private mode); silently no-op.
  }
}

function buildItems(status: OnboardingStatus): { key: ItemKey; done: boolean; href: string }[] {
  const dogId = status.mostRecentDogId;
  return [
    { key: "addDog", done: status.hasDog, href: "/my/dogs/new" },
    {
      key: "logMoments",
      done: status.momentsCount >= 3,
      href: dogId ? `/my/journal?dogId=${dogId}` : "/my/journal",
    },
    {
      key: "setGoal",
      done: status.hasGoal,
      href: dogId ? `/my/dogs/${dogId}` : "/my/dogs/new",
    },
    {
      key: "finalizeBrief",
      done: status.hasFinalizedBrief,
      href: dogId ? `/my/dogs/${dogId}/brief` : "/my/brief",
    },
    { key: "shareWithTrainer", done: status.hasSentBrief, href: "/trainers" },
  ];
}

export function OnboardingChecklist() {
  const { t } = useI18n();
  const { data: status } = useOnboardingStatus();
  const { celebrate } = useTuring();
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  const items = status ? buildItems(status) : [];
  const allDone = !!status && items.every((item) => item.done);

  const prevAllDone = useRef<boolean | undefined>(undefined);
  // Derived-state trigger: onboarding completion spans multiple mutations across
  // pages, so we watch the query-derived `allDone` and hop once on a real
  // false->true transition (the undefined baseline avoids firing on mount).
  useEffect(() => {
    if (!status) return;
    if (prevAllDone.current === false && allDone) celebrate(true, "turing.celebrateOnboarding");
    prevAllDone.current = allDone;
  }, [status, allDone, celebrate]);

  if (!status) return null;

  if (allDone && dismissed) return null;

  if (allDone) {
    return (
      <section className="flex items-center justify-between rounded border border-silver bg-white p-4">
        <p className="text-slate">
          <span aria-hidden="true">✓ </span>
          {t("onboarding.allSetUp")}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            writeDismissed();
            setDismissed(true);
          }}
        >
          {t("onboarding.dismiss")}
        </Button>
      </section>
    );
  }

  const labels: Record<ItemKey, string> = {
    addDog: t("onboarding.addDog"),
    logMoments: t("onboarding.logMoments"),
    setGoal: t("onboarding.setGoal"),
    finalizeBrief: t("onboarding.finalizeBrief"),
    shareWithTrainer: t("onboarding.shareWithTrainer"),
  };

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <h2 className="font-semibold text-slate">{t("onboarding.title")}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.href}
              className={`flex items-center gap-2 hover:underline ${
                item.done ? "text-slate-soft" : "text-slate"
              }`}
            >
              <span aria-hidden="true" className="w-4 text-center">
                {item.done ? "✓" : "○"}
              </span>
              <span>{labels[item.key]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
