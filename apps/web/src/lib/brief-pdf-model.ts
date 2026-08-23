/**
 * Pure, serializable model builder for the Behavior Brief PDF.
 *
 * Maps the brief + dog data already available on the brief page into a flat,
 * plain object that the `BriefPdfDocument` renders. Kept free of React /
 * @react-pdf imports so it is trivially unit-testable.
 */

import type { Locale } from "@turingcare/i18n";

export type BriefForPdf = {
  generatedAt: string;
  status: string;
  summary: string;
  version: number;
  locale?: Locale;
};

export type DogForPdf = {
  id?: string;
  name: string;
  breed?: string | null;
  dateOfBirth?: string | null;
  size?: string | null;
  sex?: string | null;
};

export type BriefPdfModel = {
  brandName: string;
  title: string;
  dogName: string;
  breed: string | null;
  /** Whole years, or null when DOB is unavailable. */
  ageYears: number | null;
  /** Human label, e.g. "4 yr" or "3 mo", or null. */
  age: string | null;
  size: string | null;
  sex: string | null;
  status: string;
  statusLabel: string;
  version: number;
  /** Localized/readable generated date string. */
  generatedAt: string;
  summary: string;
  /** Safe download filename, e.g. "behavior-brief-biscuit.pdf". */
  fileName: string;
  labels: {
    breed: string;
    age: string;
    size: string;
    sex: string;
    generated: string;
  };
};

const pdfCatalog = {
  en: {
    title: "Behavior Brief",
    filenamePrefix: "behavior-brief",
    labels: {
      breed: "Breed",
      age: "Age",
      size: "Size",
      sex: "Sex",
      generated: "Generated",
    },
    status: { draft: "draft", finalized: "finalized" },
    size: { small: "Small", medium: "Medium", large: "Large", giant: "Giant" },
    sex: { male: "Male", female: "Female" },
    years: (value: number) => `${value} yr`,
    months: (value: number) => `${value} mo`,
  },
  es: {
    title: "Resumen de conducta",
    filenamePrefix: "resumen-conducta",
    labels: {
      breed: "Raza",
      age: "Edad",
      size: "Tamaño",
      sex: "Sexo",
      generated: "Generado",
    },
    status: { draft: "Borrador", finalized: "Definitivo" },
    size: { small: "Pequeño", medium: "Mediano", large: "Grande", giant: "Gigante" },
    sex: { male: "Macho", female: "Hembra" },
    years: (value: number) => `${value} ${value === 1 ? "año" : "años"}`,
    months: (value: number) => `${value} ${value === 1 ? "mes" : "meses"}`,
  },
} as const;

function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

function ageLabel(dob: Date, now: Date, locale: Locale): { years: number; label: string } {
  const months = monthsBetween(dob, now);
  const years = Math.floor(months / 12);
  const t = pdfCatalog[locale];
  return years >= 1 ? { years, label: t.years(years) } : { years: 0, label: t.months(months) };
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "dog"
  );
}

export function buildBriefPdfModel(input: {
  brief: BriefForPdf;
  dog?: DogForPdf | null;
  /** Reference time for date formatting / age (injectable for tests). */
  now?: string | number | Date;
  locale?: string;
}): BriefPdfModel {
  const { brief, dog, now } = input;
  const locale = brief.locale ?? "en";
  const t = pdfCatalog[locale];
  const refNow = now ? new Date(now) : new Date();

  const dogName = dog?.name?.trim() || "Unknown";
  const breed = dog?.breed?.trim() ? dog.breed.trim() : null;

  let ageYears: number | null = null;
  let age: string | null = null;
  if (dog?.dateOfBirth) {
    const dob = new Date(dog.dateOfBirth);
    if (!Number.isNaN(dob.getTime())) {
      const a = ageLabel(dob, refNow, locale);
      ageYears = a.years;
      age = a.label;
    }
  }

  let generatedAt = brief.generatedAt;
  const gen = new Date(brief.generatedAt);
  if (!Number.isNaN(gen.getTime())) {
    try {
      generatedAt = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(gen);
    } catch {
      generatedAt = gen.toISOString().slice(0, 10);
    }
  }

  return {
    brandName: "TuringCare",
    title: t.title,
    dogName,
    breed,
    ageYears,
    age,
    size: dog?.size?.trim()
      ? (t.size[dog.size.trim() as keyof typeof t.size] ?? dog.size.trim())
      : null,
    sex: dog?.sex?.trim() ? (t.sex[dog.sex.trim() as keyof typeof t.sex] ?? dog.sex.trim()) : null,
    status: brief.status,
    statusLabel: t.status[brief.status as keyof typeof t.status] ?? brief.status,
    version: brief.version,
    generatedAt,
    summary: brief.summary,
    fileName: `${t.filenamePrefix}-${slug(dogName)}.pdf`,
    labels: t.labels,
  };
}
