import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DogProfile,
  GuidedSetupBehaviorAction,
  GuidedSetupProgressAction,
  GuidedSetupStatus,
  GuidedSetupTrainingAction,
  guidedSetupIntentInputSchema,
  guidedSetupMutationSchema,
} from "@turingcare/shared";
import type { InferResponseType } from "hono/client";
import type { z } from "zod";
import { suggestionKey } from "./suggestion-key";
import { focusKey } from "./weekly-focus";

export const guidedSetupKey = ["guided-setup"] as const;

const guidedSetup = api.api["guided-setup"];

export type GuidedBehaviorActionResponse = InferResponseType<
  typeof guidedSetup.action.behavior.$post,
  200 | 201
>;
export type GuidedProgressActionResponse = InferResponseType<
  typeof guidedSetup.action.progress.$post,
  200 | 201
>;
export type GuidedTrainingActionResponse = InferResponseType<
  typeof guidedSetup.action.training.$post,
  200 | 201
>;
export type GuidedSkipResponse = InferResponseType<typeof guidedSetup.skip.$post, 200>;

type CompletionCallback<T> = {
  onCompleted?: (response: T) => void;
};

export function isGuidedSetupConflict(error: unknown, code: string): boolean {
  return error instanceof Error && error.message === code;
}

export function isGuidedSetupReconciliationConflict(error: unknown): boolean {
  return (
    isGuidedSetupConflict(error, "intent_mismatch") ||
    isGuidedSetupConflict(error, "setup_already_completed") ||
    isGuidedSetupConflict(error, "setup_not_ready_for_completion")
  );
}

const aggregateKeys = [
  guidedSetupKey,
  ["dogs"],
  ["dogs-overview"],
  ["overview"],
  ["onboarding"],
  ["journal"],
] as const;

type ResponseWithJson = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function isErrorBody(body: unknown): body is { error?: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    (body.error === undefined || typeof body.error === "string")
  );
}

function parseResponse<T>(response: ResponseWithJson, fallback: string): Promise<T>;
async function parseResponse(response: ResponseWithJson, fallback: string): Promise<unknown> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(isErrorBody(body) ? (body.error ?? fallback) : fallback);
  }
  return body;
}

function invalidateAggregateCaches(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all(aggregateKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

function invalidateActionCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  dogId: string | null,
  weekKey?: string,
) {
  const invalidations: Promise<unknown>[] = [invalidateAggregateCaches(queryClient)];
  if (dogId !== null) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ["dog-journal", dogId] }),
      queryClient.invalidateQueries({ queryKey: ["progress", dogId] }),
    );
    if (weekKey !== undefined) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: focusKey(dogId, weekKey) }),
        queryClient.invalidateQueries({ queryKey: suggestionKey(dogId, weekKey) }),
      );
    }
  }
  return Promise.all(invalidations);
}

export function useGuidedSetup() {
  return useQuery({
    queryKey: guidedSetupKey,
    queryFn: async (): Promise<GuidedSetupStatus> =>
      parseResponse<InferResponseType<typeof guidedSetup.$get, 200>>(
        await guidedSetup.$get(),
        "load_failed",
      ),
  });
}

export function useStartGuidedSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: DogProfile) =>
      parseResponse<InferResponseType<typeof guidedSetup.$post, 201>>(
        await guidedSetup.$post({ json: body }),
        "start_failed",
      ),
    onSuccess: () => invalidateAggregateCaches(queryClient),
  });
}

export function useSaveGuidedSetupIntent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: z.infer<typeof guidedSetupIntentInputSchema>) =>
      parseResponse<InferResponseType<typeof guidedSetup.intent.$put, 200>>(
        await guidedSetup.intent.$put({ json: body }),
        "intent_failed",
      ),
    onSuccess: () => invalidateAggregateCaches(queryClient),
  });
}

export function useCompleteBehaviorSetup(
  options: CompletionCallback<GuidedBehaviorActionResponse> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: GuidedSetupBehaviorAction) =>
      parseResponse<InferResponseType<typeof guidedSetup.action.behavior.$post, 200 | 201>>(
        await guidedSetup.action.behavior.$post({ json: body }),
        "behavior_failed",
      ),
    onSuccess: (response) => {
      options.onCompleted?.(response);
      return invalidateActionCaches(queryClient, response.setup.dogId);
    },
  });
}

export function useCompleteTrainingSetup(
  options: CompletionCallback<GuidedTrainingActionResponse> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: GuidedSetupTrainingAction) =>
      parseResponse<InferResponseType<typeof guidedSetup.action.training.$post, 200 | 201>>(
        await guidedSetup.action.training.$post({ json: body }),
        "training_failed",
      ),
    onSuccess: (response, variables) => {
      options.onCompleted?.(response);
      return invalidateActionCaches(queryClient, response.setup.dogId, variables.weekKey);
    },
  });
}

export function useCompleteProgressSetup(
  options: CompletionCallback<GuidedProgressActionResponse> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: GuidedSetupProgressAction) =>
      parseResponse<InferResponseType<typeof guidedSetup.action.progress.$post, 200 | 201>>(
        await guidedSetup.action.progress.$post({ json: body }),
        "progress_failed",
      ),
    onSuccess: (response) => {
      options.onCompleted?.(response);
      return invalidateActionCaches(queryClient, response.setup.dogId);
    },
  });
}

export function useSkipGuidedSetup(options: CompletionCallback<GuidedSkipResponse> = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: z.infer<typeof guidedSetupMutationSchema>) =>
      parseResponse<InferResponseType<typeof guidedSetup.skip.$post, 200>>(
        await guidedSetup.skip.$post({ json: body }),
        "skip_failed",
      ),
    onSuccess: (response) => {
      options.onCompleted?.(response);
      return invalidateAggregateCaches(queryClient);
    },
  });
}

export function useAbandonGuidedSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: z.infer<typeof guidedSetupMutationSchema>) =>
      parseResponse<InferResponseType<typeof guidedSetup.abandon.$post, 200>>(
        await guidedSetup.abandon.$post({ json: body }),
        "abandon_failed",
      ),
    onSuccess: () => invalidateAggregateCaches(queryClient),
  });
}
