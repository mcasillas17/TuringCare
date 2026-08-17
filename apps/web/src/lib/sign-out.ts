import { useI18n } from "@/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { signOut } from "./auth-client";

type SignOutResult = {
  ok: boolean;
};

export function useSignOut() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async (destination = "/login"): Promise<SignOutResult> => {
    let failed = false;
    try {
      const result = await signOut();
      failed = Boolean(result?.error);
    } catch {
      failed = true;
    }

    queryClient.clear();
    navigate(destination);

    if (failed) {
      toast.error(t("app.signOutFailed"));
    }
    return { ok: !failed };
  };
}
