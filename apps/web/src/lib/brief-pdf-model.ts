/**
 * Pure, serializable model builder for the Behavior Brief PDF.
 *
 * Maps the brief + dog data already available on the brief page into a flat,
 * plain object that the `BriefPdfDocument` renders. Kept free of React /
 * @react-pdf imports so it is trivially unit-testable.
 */

export type BriefForPdf = {
  generatedAt: string;
  status: string;
  summary: string;
  version: number;
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
  version: number;
  /** Localized/readable generated date string. */
  generatedAt: string;
  summary: string;
  /** Safe download filename, e.g. "behavior-brief-biscuit.pdf". */
  fileName: string;
};

function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

function ageLabel(dob: Date, now: Date): { years: number; label: string } {
  const months = monthsBetween(dob, now);
  const years = Math.floor(months / 12);
  return years >= 1 ? { years, label: `${years} yr` } : { years: 0, label: `${months} mo` };
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
  const { brief, dog, now, locale = "en" } = input;
  const refNow = now ? new Date(now) : new Date();

  const dogName = dog?.name?.trim() || "Unknown";
  const breed = dog?.breed?.trim() ? dog.breed.trim() : null;

  let ageYears: number | null = null;
  let age: string | null = null;
  if (dog?.dateOfBirth) {
    const dob = new Date(dog.dateOfBirth);
    if (!Number.isNaN(dob.getTime())) {
      const a = ageLabel(dob, refNow);
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
    title: "Behavior Brief",
    dogName,
    breed,
    ageYears,
    age,
    size: dog?.size?.trim() ? dog.size.trim() : null,
    sex: dog?.sex?.trim() ? dog.sex.trim() : null,
    status: brief.status,
    version: brief.version,
    generatedAt,
    summary: brief.summary,
    fileName: `behavior-brief-${slug(dogName)}.pdf`,
  };
}
