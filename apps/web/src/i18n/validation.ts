import { isValidationMessageCode } from "@turingcare/shared";
import { useI18n } from ".";

export function useValidationMessage() {
  const { t } = useI18n();

  return (message: unknown) =>
    isValidationMessageCode(message) ? t(message) : t("validation.invalid");
}
