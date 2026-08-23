import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Locale, isLocale } from "@turingcare/i18n";
import type { ProfileLocaleUpdateInput, ProfileUpdateInput } from "@turingcare/shared";
import { api } from "./api";
import { isNonemptySessionUserId } from "./session-user-id";

export type ProfileUser = {
  id: string;
  name: string;
  email: string;
  locale: Locale | null;
};

type ProfileResponseErrorCode = "invalid_profile_locale_response" | "invalid_profile_response";

export class ProfileResponseError extends Error {
  readonly code: ProfileResponseErrorCode;

  constructor(code: ProfileResponseErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "ProfileResponseError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function decodeProfileResponse(
  response: { json: () => Promise<unknown> },
  expectedUserId: string,
): Promise<ProfileUser> {
  try {
    const body = await response.json();
    const profile = isRecord(body) && isRecord(body.user) ? body.user : null;
    if (
      !profile ||
      typeof profile.id !== "string" ||
      profile.id !== expectedUserId ||
      typeof profile.name !== "string" ||
      typeof profile.email !== "string" ||
      !(profile.locale === null || isLocale(profile.locale))
    ) {
      throw new ProfileResponseError("invalid_profile_response");
    }

    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      locale: profile.locale,
    };
  } catch (error) {
    if (error instanceof ProfileResponseError) throw error;
    throw new ProfileResponseError("invalid_profile_response", error);
  }
}

async function decodeProfileLocaleResponse(response: {
  json: () => Promise<unknown>;
}): Promise<{ locale: Locale }> {
  try {
    const body = await response.json();
    const locale = isRecord(body) && isRecord(body.user) ? body.user.locale : null;
    if (!isLocale(locale)) throw new ProfileResponseError("invalid_profile_locale_response");
    return { locale };
  } catch (error) {
    if (error instanceof ProfileResponseError) throw error;
    throw new ProfileResponseError("invalid_profile_locale_response", error);
  }
}

export function useProfile(userId: string | null) {
  const scopedUserId = isNonemptySessionUserId(userId) ? userId : null;

  return useQuery({
    queryKey: ["profile", scopedUserId] as const,
    enabled: scopedUserId !== null,
    queryFn: async (): Promise<ProfileUser> => {
      if (!scopedUserId) throw new ProfileResponseError("invalid_profile_response");
      const res = await api.api.profile.$get();
      if (!res.ok) throw new Error("load_failed");
      return decodeProfileResponse(res, scopedUserId);
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProfileUpdateInput) => {
      const res = await api.api.profile.$put({ json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function useUpdateProfileLocale() {
  return useMutation({
    mutationFn: async (body: ProfileLocaleUpdateInput) => {
      const res = await api.api.profile.locale.$patch({ json: body });
      if (!res.ok) throw new Error("save_failed");
      return decodeProfileLocaleResponse(res);
    },
  });
}
