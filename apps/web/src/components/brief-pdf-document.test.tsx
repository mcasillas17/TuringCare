import { buildBriefPdfModel } from "@/lib/brief-pdf-model";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { BriefPdfDocument } from "./brief-pdf-document";

// jsdom cannot render real @react-pdf primitives to PDF bytes; this only
// asserts the document component constructs a valid React tree from a model
// without throwing. The Download flow itself is covered by brief.test.tsx.
describe("BriefPdfDocument", () => {
  const model = buildBriefPdfModel({
    brief: {
      generatedAt: "2026-05-19T10:00:00.000Z",
      status: "draft",
      summary: "Behavior Brief — Biscuit",
      version: 1,
    },
    dog: {
      name: "Biscuit",
      breed: "Border Collie",
      dateOfBirth: "2022-05-19",
      size: "medium",
      sex: "female",
    },
    now: "2026-05-19T12:00:00.000Z",
  });

  it("builds a valid React element from a model without throwing", () => {
    const el = BriefPdfDocument({ model });
    expect(isValidElement(el)).toBe(true);
  });

  it("builds without throwing when optional dog fields are absent", () => {
    const sparse = buildBriefPdfModel({
      brief: {
        generatedAt: "2026-05-19T10:00:00.000Z",
        status: "finalized",
        summary: "Behavior Brief — Rex",
        version: 3,
      },
      dog: undefined,
      now: "2026-05-19T12:00:00.000Z",
    });
    expect(() => BriefPdfDocument({ model: sparse })).not.toThrow();
  });
});
