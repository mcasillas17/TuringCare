import type { MessageKey } from "@/i18n/types";

export type TipContext = "general" | "training" | "journal" | "week" | "brief";

/** i18n catalog keys for each tip context. Strings live in the `turing` section
 *  of the en/es catalogs (parity enforced by the i18n test). */
export const TURING_TIP_BUCKETS: Record<TipContext, MessageKey[]> = {
  general: [
    "turing.tip1",
    "turing.tip2",
    "turing.tip3",
    "turing.tip4",
    "turing.tip5",
    "turing.tip6",
  ],
  training: ["turing.trainingTip1", "turing.trainingTip2", "turing.trainingTip3"],
  journal: ["turing.journalTip1", "turing.journalTip2", "turing.journalTip3"],
  week: ["turing.weekTip1", "turing.weekTip2"],
  brief: ["turing.briefTip1", "turing.briefTip2"],
};

/** Back-compat alias for the default (general) tips. */
export const TURING_TIP_KEYS = TURING_TIP_BUCKETS.general;

/** Pick the tip bucket for the current route. */
export function tipContextForPath(pathname: string): TipContext {
  if (/\/training(\/|$)/.test(pathname)) return "training";
  if (/\/journal(\/|$)/.test(pathname)) return "journal";
  if (/\/week(\/|$)/.test(pathname)) return "week";
  if (/\/brief(\/|$)/.test(pathname)) return "brief";
  return "general";
}
