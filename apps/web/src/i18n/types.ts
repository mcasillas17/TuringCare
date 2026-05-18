import type { en } from "./en";

export type Locale = "en" | "es";

/** The literal-typed English source (for exact key derivation). */
export type En = typeof en;

/** The catalog shape with widened string leaves — both `en` and `es`
 *  structurally satisfy this; used for the runtime catalog map. */
export type Messages = { [S in keyof En]: { [K in keyof En[S]]: string } };

/** Dot-path keys, e.g. "hero.headline". */
export type MessageKey = {
  [S in keyof En]: En[S] extends Record<string, string>
    ? `${S & string}.${keyof En[S] & string}`
    : never;
}[keyof En];
