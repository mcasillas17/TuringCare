export const VALIDATION_MESSAGE_CODES = {
  nameRequired: "validation.nameRequired",
  emailInvalid: "validation.emailInvalid",
  passwordTooShort: "validation.passwordTooShort",
  passwordRequired: "validation.passwordRequired",
  noteTooLong: "validation.noteTooLong",
  organizationRequired: "validation.organizationRequired",
  cityRequired: "validation.cityRequired",
  stateRequired: "validation.stateRequired",
  httpUrlRequired: "validation.httpUrlRequired",
  concernRequired: "validation.concernRequired",
  goalRequired: "validation.goalRequired",
  quickNoteRequired: "validation.quickNoteRequired",
  dateRequired: "validation.dateRequired",
  dateInvalid: "validation.dateInvalid",
  dailyCheckInTrendOnly: "validation.dailyCheckInTrendOnly",
  dailyCheckInTrendRequired: "validation.dailyCheckInTrendRequired",
  skillNameRequired: "validation.skillNameRequired",
  passwordMismatch: "validation.passwordMismatch",
  passwordSameAsCurrent: "validation.passwordSameAsCurrent",
} as const;

export type ValidationMessageCode =
  (typeof VALIDATION_MESSAGE_CODES)[keyof typeof VALIDATION_MESSAGE_CODES];

const VALIDATION_MESSAGE_CODE_SET = new Set<string>(Object.values(VALIDATION_MESSAGE_CODES));

export function isValidationMessageCode(value: unknown): value is ValidationMessageCode {
  return typeof value === "string" && VALIDATION_MESSAGE_CODE_SET.has(value);
}
