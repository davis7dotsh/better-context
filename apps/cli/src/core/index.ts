/**
 * Core Services Orchestrator
 *
 * This module provides a unified interface to all the new core services.
 * It handles initialization, dependency injection, and cleanup.
 */

import { FileSystem, Path } from '@effect/platform';
import { Effect } from 'effect';
import { createConfigService, type ConfigService } from './config/service.ts';
import { createResourceService, type ResourceService } from './resource/service.ts';
import { createCollectionService, type CollectionService } from './collection/service.ts';
import { createThreadService, type ThreadService } from './thread/service.ts';
import { createThreadRepository } from './thread/repository.ts';
import { createAgentService, type AgentService } from './agent/service.ts';
import type { ResourceInfo } from './resource/types.ts';

export interface CoreServices {
	config: ConfigService;
	resources: ResourceService;
	collections: CollectionService;
	threads: ThreadService;
	agent: AgentService;
}

/**
 * Initialize all core services
 */
export const initializeCoreServices = Effect.gen(function* () {
	const pathService = yield* Path.Path;

	// Initialize config first
	const config = yield* createConfigService;
	const configData = yield* config.getConfig();

	// Initialize resource service
	const resources = yield* createResourceService({
		resourcesDir: configData.resourcesDirectory,
		resources: configData.resources
	});

	// Initialize collection service
	const collections = yield* createCollectionService({
		collectionsDir: configData.collectionsDirectory,
		resourceService: resources
	});

	// Initialize thread repository and service
	const dbPath = pathService.join(configData.dataDirectory, 'btca.db');
	const threadRepository = yield* createThreadRepository(dbPath);
	const threads = createThreadService({ repository: threadRepository });

	// Initialize agent service
	const agent = createAgentService({
		provider: configData.provider,
		model: configData.model
	});

	return {
		config,
		resources,
		collections,
		threads,
		agent
	} satisfies CoreServices;
});

/**
 * Helper to get resource infos from resource names
 */
export const getResourceInfos = (
	resources: ResourceService,
	resourceNames: string[]
): Effect.Effect<ResourceInfo[], any, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const infos: ResourceInfo[] = [];
		for (const name of resourceNames) {
			const info = yield* resources.ensure(name, { quiet: true });
			infos.push(info);
		}
		return infos;
	});

// Re-export types
export type { ConfigService } from './config/service.ts';
export type { ResourceService } from './resource/service.ts';
export type { CollectionService } from './collection/service.ts';
export type { ThreadService } from './thread/service.ts';
export type { AgentService } from './agent/service.ts';
export type { ResourceDefinition, ResourceInfo } from './resource/types.ts';
export type { CollectionInfo } from './collection/types.ts';
export type { Thread, Question, QuestionMetadata, ThreadSummary } from './thread/types.ts';
export type { SessionState, AgentMetadata } from './agent/types.ts';

// Re-export errors
export { ConfigError } from './config/service.ts';
export { ResourceError, ResourceNotFoundError, ResourceNotCachedError } from './resource/errors.ts';
export { CollectionError } from './collection/service.ts';
export { ThreadRepositoryError } from './thread/repository.ts';
export {
	AgentError,
	InvalidProviderError,
	InvalidModelError,
	ProviderNotConnectedError
} from './agent/service.ts';

// Re-export utilities
export { buildThreadContextPrompt, extractMetadataFromEvents } from './agent/service.ts';
export { getAccumulatedResources, getThreadResources } from './thread/types.ts';
export { getCollectionKey } from './collection/types.ts';
