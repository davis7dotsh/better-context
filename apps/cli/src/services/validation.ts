import { TaggedError } from "effect/Data";
import { Effect } from "effect";
import type { OpencodeClient } from "@opencode-ai/sdk";

// Error types
export class InvalidProviderError extends TaggedError("InvalidProviderError")<{
  readonly providerId: string;
  readonly availableProviders: string[];
}> {}

export class InvalidModelError extends TaggedError("InvalidModelError")<{
  readonly providerId: string;
  readonly modelId: string;
  readonly availableModels: string[];
}> {}

export class ProviderNotConnectedError extends TaggedError(
  "ProviderNotConnectedError"
)<{
  readonly providerId: string;
  readonly connectedProviders: string[];
}> {}

// Validation function
export const validateProviderModel = (
  client: OpencodeClient,
  providerId: string,
  modelId: string
): Effect.Effect<
  void,
  InvalidProviderError | InvalidModelError | ProviderNotConnectedError
> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise(() => client.provider.list()).pipe(
      Effect.option // Convert errors to None, success to Some
    );

    // If we couldn't fetch providers, skip validation (fail open)
    if (response._tag === "None" || !response.value.data) {
      return;
    }

    const { all, connected } = response.value.data;

    // Check if provider exists
    const provider = all.find((p) => p.id === providerId);
    if (!provider) {
      return yield* Effect.fail(
        new InvalidProviderError({
          providerId,
          availableProviders: all.map((p) => p.id),
        })
      );
    }

    // Check if provider is connected (has valid auth)
    if (!connected.includes(providerId)) {
      return yield* Effect.fail(
        new ProviderNotConnectedError({
          providerId,
          connectedProviders: connected,
        })
      );
    }

    // Check if model exists for this provider
    const modelIds = Object.keys(provider.models);
    if (!modelIds.includes(modelId)) {
      return yield* Effect.fail(
        new InvalidModelError({
          providerId,
          modelId,
          availableModels: modelIds,
        })
      );
    }
  });
