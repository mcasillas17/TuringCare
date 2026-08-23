import { describe, expect, it } from "vitest";
import { buildBriefPdfModel } from "./brief-pdf-model";

const baseBrief = {
  id: "b1",
  dogId: "d1",
  generatedAt: "2026-05-19T10:00:00.000Z",
  status: "draft" as const,
  summary: "Behavior Brief — Biscuit\nConcerns: separation anxiety.",
  version: 2,
  locale: "en" as const,
};

const baseDog = {
  id: "d1",
  name: "Biscuit",
  breed: "Border Collie",
  dateOfBirth: "2022-05-19",
  size: "medium",
  sex: "female",
};

describe("buildBriefPdfModel", () => {
  it("maps brief + dog fields into the PDF model", () => {
    const m = buildBriefPdfModel({
      brief: baseBrief,
      dog: baseDog,
      now: "2026-05-19T12:00:00.000Z",
    });

    expect(m.title).toBe("Behavior Brief");
    expect(m.brandName).toBe("TuringCare");
    expect(m.dogName).toBe("Biscuit");
    expect(m.breed).toBe("Border Collie");
    expect(m.summary).toBe(baseBrief.summary);
    expect(m.version).toBe(2);
    expect(m.status).toBe("draft");
  });

  it("computes the dog's age in years from dateOfBirth relative to now", () => {
    const m = buildBriefPdfModel({
      brief: baseBrief,
      dog: baseDog,
      now: "2026-05-19T12:00:00.000Z",
    });
    // Born 2022-05-19, as of 2026-05-19 -> exactly 4 years
    expect(m.ageYears).toBe(4);
    expect(m.age).toBe("4 yr");
  });

  it("renders age in months when under a year old", () => {
    const m = buildBriefPdfModel({
      brief: baseBrief,
      dog: { ...baseDog, dateOfBirth: "2026-02-19" },
      now: "2026-05-19T12:00:00.000Z",
    });
    expect(m.ageYears).toBe(0);
    expect(m.age).toBe("3 mo");
  });

  it("formats generatedAt into a readable date string", () => {
    const m = buildBriefPdfModel({
      brief: baseBrief,
      dog: baseDog,
      now: "2026-05-19T12:00:00.000Z",
    });
    expect(m.generatedAt).toContain("2026");
    // Should not be the raw ISO timestamp
    expect(m.generatedAt).not.toBe(baseBrief.generatedAt);
  });

  it("handles missing optional dog fields gracefully", () => {
    const m = buildBriefPdfModel({
      brief: baseBrief,
      dog: { id: "d1", name: "Rex", breed: null, dateOfBirth: null, size: "large", sex: "male" },
      now: "2026-05-19T12:00:00.000Z",
    });
    expect(m.dogName).toBe("Rex");
    expect(m.breed).toBeNull();
    expect(m.age).toBeNull();
    expect(m.ageYears).toBeNull();
  });

  it("falls back to an Unknown dog when no dog is provided", () => {
    const m = buildBriefPdfModel({
      brief: baseBrief,
      dog: undefined,
      now: "2026-05-19T12:00:00.000Z",
    });
    expect(m.dogName).toBe("Unknown");
    expect(m.breed).toBeNull();
    expect(m.age).toBeNull();
  });

  it("produces a safe filename slug from the dog name", () => {
    const m = buildBriefPdfModel({
      brief: baseBrief,
      dog: { ...baseDog, name: "Mr. Waffles!! (Good Boy)" },
      now: "2026-05-19T12:00:00.000Z",
    });
    expect(m.fileName).toBe("behavior-brief-mr-waffles-good-boy.pdf");
  });

  it("uses the stored Spanish brief locale for labels, filename, date, and enum values", () => {
    const m = buildBriefPdfModel({
      brief: { ...baseBrief, locale: "es", status: "finalized" },
      dog: baseDog,
      now: "2026-05-19T12:00:00.000Z",
    });

    expect(m.title).toBe("Resumen de conducta");
    expect(m.fileName).toBe("resumen-conducta-biscuit.pdf");
    expect(m.generatedAt).toBe("19 de mayo de 2026");
    expect(m.statusLabel).toBe("Definitivo");
    expect(m.age).toBe("4 años");
    expect(m.size).toBe("Mediano");
    expect(m.sex).toBe("Hembra");
    expect(m.labels).toEqual({
      breed: "Raza",
      age: "Edad",
      size: "Tamaño",
      sex: "Sexo",
      generated: "Generado",
    });
  });

  it("prefers brief.locale over the current UI locale", () => {
    const m = buildBriefPdfModel({
      brief: { ...baseBrief, locale: "es" },
      dog: baseDog,
      now: "2026-05-19T12:00:00.000Z",
      locale: "en",
    });

    expect(m.title).toBe("Resumen de conducta");
    expect(m.generatedAt).toBe("19 de mayo de 2026");
  });
});
