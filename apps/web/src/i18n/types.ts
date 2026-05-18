import type { en } from "./en";

export type Locale = "en" | "es";

/** The catalog shape; `es` must structurally match `en`. */
export type Messages = typeof en;

type Primitive = string;

/** Dot-path keys of the (2-level) catalog, e.g. "hero.headline". */
export type MessageKey = {
  [S in keyof Messages]: Messages[S] extends Record<string, Primitive>
    ? `${S & string}.${keyof Messages[S] & string}`
    : never;
}[keyof Messages];
