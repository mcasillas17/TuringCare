import type { MessageKey } from "@/i18n/types";

/**
 * i18n catalog keys for the six training tips Turing "barks" when tapped. The
 * strings themselves live in the `turing` section of the en/es catalogs (with
 * parity enforced by the i18n test); this module just lists the keys so the
 * component can pick one at random and resolve it via `t()`.
 */
export const TURING_TIP_KEYS: MessageKey[] = [
  "turing.tip1",
  "turing.tip2",
  "turing.tip3",
  "turing.tip4",
  "turing.tip5",
  "turing.tip6",
];
