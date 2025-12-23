import { Effect } from 'effect';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { InvalidProviderError, InvalidModelError, ProviderNotConnectedError } from '../errors';

export const validateProviderAndModel = (
	client: OpencodeClient,
	providerId: string,
	modelId: string
) =>
	Effect.gen(function* () {
		const response = yield* Effect.tryPromise(() => client.provider.list()).pipe(Effect.option);

		// If we couldn't fetch providers, skip validation (fail open)
		if (response._tag === 'None' || !response.value.data) {
			return;
		}

		const { all, connected } = response.value.data;

		// Check if provider exists
		const provider = all.find((p) => p.id === providerId);
		if (!provider) {
			return yield* Effect.fail(
				new InvalidProviderError({
					providerId,
					availableProviders: all.map((p) => p.id)
				})
			);
		}

		// Check if provider is connected (has valid auth)
		if (!connected.includes(providerId)) {
			return yield* Effect.fail(
				new ProviderNotConnectedError({
					providerId,
					connectedProviders: connected
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
					availableModels: modelIds
				})
			);
		}
	});
