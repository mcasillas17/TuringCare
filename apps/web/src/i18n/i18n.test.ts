import { describe, expect, it } from "vitest";
import { en } from "./en";
import { es } from "./es";

function keyPaths(o: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("i18n catalogs", () => {
  it("es has exactly the same keys as en", () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });
  it("no es value is left equal to its en value (untranslated)", () => {
    const flat = (o: Record<string, unknown>, p = ""): [string, unknown][] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object"
          ? flat(v as Record<string, unknown>, `${p}${k}.`)
          : [[`${p}${k}`, v]],
      );
    const enF = Object.fromEntries(flat(en));
    const untranslated = flat(es)
      .filter(([k, v]) => v === enF[k])
      .map(([k]) => k)
      .filter((k) => !["footer.brand", "language.en", "language.es"].includes(k));
    expect(untranslated).toEqual([]);
  });
});
