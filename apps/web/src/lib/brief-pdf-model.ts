/**
 * Pure, serializable model builder for the Behavior Brief PDF.
 *
 * Maps the brief + dog data already available on the brief page into a flat,
 * plain object that the `BriefPdfDocument` renders. Kept free of React /
 * @react-pdf imports so it is trivially unit-testable.
 */

import {
  type Locale,
  type MessageKey,
  createI18n,
  formatDateInUtc,
  isLocale,
  translate,
} from "@turingcare/i18n";

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

type PdfTranslator = (key: MessageKey, vars?: Record<string, string | number>) => string;

const PDF_STATUS_KEYS = {
  draft: "briefPdf.status.draft",
  finalized: "briefPdf.status.finalized",
} as const satisfies Record<string, MessageKey>;

const PDF_SIZE_KEYS = {
  small: "briefPdf.size.small",
  medium: "briefPdf.size.medium",
  large: "briefPdf.size.large",
  giant: "briefPdf.size.giant",
} as const satisfies Record<string, MessageKey>;

const PDF_SEX_KEYS = {
  male: "briefPdf.sex.male",
  female: "briefPdf.sex.female",
} as const satisfies Record<string, MessageKey>;

function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

function ageLabel(dob: Date, now: Date, t: PdfTranslator): { years: number; label: string } {
  const months = monthsBetween(dob, now);
  const years = Math.floor(months / 12);
  return years >= 1
    ? {
        years,
        label: t(years === 1 ? "briefPdf.yearOne" : "briefPdf.yearOther", { value: years }),
      }
    : {
        years: 0,
        label: t(months === 1 ? "briefPdf.monthOne" : "briefPdf.monthOther", { value: months }),
      };
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
}): BriefPdfModel {
  const { brief, dog, now } = input;
  const locale: Locale = isLocale(brief.locale) ? brief.locale : "en";
  const i18n = createI18n(locale);
  const t: PdfTranslator = (key, vars) => translate(i18n, key, vars);
  const refNow = now ? new Date(now) : new Date();

  const dogName = dog?.name?.trim() || t("briefPdf.unknownDogName");
  const breed = dog?.breed?.trim() ? dog.breed.trim() : null;

  let ageYears: number | null = null;
  let age: string | null = null;
  if (dog?.dateOfBirth) {
    const dob = new Date(dog.dateOfBirth);
    if (!Number.isNaN(dob.getTime())) {
      const a = ageLabel(dob, refNow, t);
      ageYears = a.years;
      age = a.label;
    }
  }

  const generatedAt =
    formatDateInUtc(locale, brief.generatedAt, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }) ?? brief.generatedAt;

  return {
    brandName: "TuringCare",
    title: t("briefPdf.title"),
    dogName,
    breed,
    ageYears,
    age,
    size: dog?.size?.trim()
      ? (() => {
          const value = dog.size.trim();
          const key = PDF_SIZE_KEYS[value as keyof typeof PDF_SIZE_KEYS];
          return key ? t(key) : value;
        })()
      : null,
    sex: dog?.sex?.trim()
      ? (() => {
          const value = dog.sex.trim();
          const key = PDF_SEX_KEYS[value as keyof typeof PDF_SEX_KEYS];
          return key ? t(key) : value;
        })()
      : null,
    status: brief.status,
    statusLabel: (() => {
      const key = PDF_STATUS_KEYS[brief.status as keyof typeof PDF_STATUS_KEYS];
      return key ? t(key) : brief.status;
    })(),
    version: brief.version,
    generatedAt,
    summary: brief.summary,
    fileName: `${t("briefPdf.filenamePrefix")}-${slug(dogName)}.pdf`,
    labels: {
      breed: t("briefPdf.labels.breed"),
      age: t("briefPdf.labels.age"),
      size: t("briefPdf.labels.size"),
      sex: t("briefPdf.labels.sex"),
      generated: t("briefPdf.labels.generated"),
    },
  };
}
