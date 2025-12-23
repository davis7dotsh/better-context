import { FileSystem, Path } from '@effect/platform';
import { Effect } from 'effect';
import type { ResourceDefinition, ResourceInfo } from './types.ts';
import { isGitResource, isLocalResource } from './types.ts';
import { ResourceError, ResourceNotFoundError, ResourceNotCachedError } from './errors.ts';
import { ensureGitResource, isGitResourceCached } from './strategies/git.ts';
import { ensureLocalResource, isLocalResourceValid } from './strategies/local.ts';
import { directoryExists, removeDirectory } from '../../lib/utils/files.ts';

export interface ResourceServiceConfig {
	resourcesDir: string;
	resources: ResourceDefinition[];
}

const createResourceService = (config: ResourceServiceConfig) =>
	Effect.gen(function* () {
		const { resourcesDir, resources } = config;
		const pathService = yield* Path.Path;
		const fs = yield* FileSystem.FileSystem;

		// Ensure resources directory exists
		const resourcesDirExists = yield* directoryExists(resourcesDir).pipe(
			Effect.mapError((e) => new ResourceError({ message: e.message, cause: e }))
		);
		if (!resourcesDirExists) {
			yield* fs
				.makeDirectory(resourcesDir, { recursive: true })
				.pipe(
					Effect.mapError(
						(e) => new ResourceError({ message: 'Failed to create resources directory', cause: e })
					)
				);
		}

		const getResourceDefinition = (name: string) => {
			const resource = resources.find((r) => r.name === name);
			if (!resource) {
				return Effect.fail(
					new ResourceNotFoundError({
						name,
						availableResources: resources.map((r) => r.name)
					})
				);
			}
			return Effect.succeed(resource);
		};

		return {
			/**
			 * Ensure a resource is cached locally.
			 * For git resources, clones or optionally pulls.
			 * For local resources, validates the path exists.
			 */
			ensure: (
				name: string,
				options?: { refresh?: boolean; quiet?: boolean }
			): Effect.Effect<
				ResourceInfo,
				ResourceError | ResourceNotFoundError,
				FileSystem.FileSystem
			> =>
				Effect.gen(function* () {
					const resource = yield* getResourceDefinition(name);
					const { refresh = false, quiet = false } = options ?? {};

					if (isGitResource(resource)) {
						return yield* ensureGitResource({
							resource,
							resourcesDir,
							refresh,
							quiet
						});
					} else if (isLocalResource(resource)) {
						// Local resources don't need caching, just validation
						return yield* ensureLocalResource({ resource, quiet }).pipe(
							Effect.mapError((e) => {
								if (e._tag === 'InvalidResourcePathError') {
									return new ResourceError({
										message: `Local resource "${e.name}" path does not exist: ${e.path}`
									});
								}
								return e;
							})
						);
					}

					return yield* Effect.fail(
						new ResourceError({
							message: `Unknown resource type: ${(resource as ResourceDefinition).type}`
						})
					);
				}),

			/**
			 * Force refresh a resource (re-pull git, re-validate local)
			 */
			refresh: (
				name: string,
				options?: { quiet?: boolean }
			): Effect.Effect<
				ResourceInfo,
				ResourceError | ResourceNotFoundError,
				FileSystem.FileSystem
			> =>
				Effect.gen(function* () {
					const resource = yield* getResourceDefinition(name);
					const { quiet = false } = options ?? {};

					if (isGitResource(resource)) {
						return yield* ensureGitResource({
							resource,
							resourcesDir,
							refresh: true,
							quiet
						});
					} else if (isLocalResource(resource)) {
						return yield* ensureLocalResource({ resource, quiet }).pipe(
							Effect.mapError((e) => {
								if (e._tag === 'InvalidResourcePathError') {
									return new ResourceError({
										message: `Local resource "${e.name}" path does not exist: ${e.path}`
									});
								}
								return e;
							})
						);
					}

					return yield* Effect.fail(
						new ResourceError({
							message: `Unknown resource type: ${(resource as ResourceDefinition).type}`
						})
					);
				}),

			/**
			 * List all defined resources
			 */
			list: (): Effect.Effect<ResourceDefinition[]> => Effect.succeed(resources),

			/**
			 * Get the cached path for a resource.
			 * Returns error if resource is not cached.
			 */
			getPath: (
				name: string
			): Effect.Effect<
				string,
				ResourceError | ResourceNotFoundError | ResourceNotCachedError,
				FileSystem.FileSystem
			> =>
				Effect.gen(function* () {
					const resource = yield* getResourceDefinition(name);

					if (isGitResource(resource)) {
						const isCached = yield* isGitResourceCached({ resource, resourcesDir });
						if (!isCached) {
							return yield* Effect.fail(new ResourceNotCachedError({ name }));
						}
						let path = pathService.join(resourcesDir, resource.name);
						if (resource.searchPath) {
							path = pathService.join(path, resource.searchPath);
						}
						return path;
					} else if (isLocalResource(resource)) {
						const isValid = yield* isLocalResourceValid({ resource });
						if (!isValid) {
							return yield* Effect.fail(
								new ResourceError({
									message: `Local resource path does not exist: ${resource.path}`
								})
							);
						}
						return resource.path;
					}

					return yield* Effect.fail(
						new ResourceError({
							message: `Unknown resource type: ${(resource as ResourceDefinition).type}`
						})
					);
				}),

			/**
			 * Remove a cached resource (only applies to git resources)
			 */
			remove: (
				name: string
			): Effect.Effect<void, ResourceError | ResourceNotFoundError, FileSystem.FileSystem> =>
				Effect.gen(function* () {
					const resource = yield* getResourceDefinition(name);

					if (isGitResource(resource)) {
						const repoDir = pathService.join(resourcesDir, resource.name);
						yield* removeDirectory(repoDir).pipe(
							Effect.mapError((e) => new ResourceError({ message: e.message, cause: e }))
						);
						yield* Effect.log(`Removed cached resource: ${name}`);
					} else if (isLocalResource(resource)) {
						yield* Effect.log(`Local resource "${name}" has no cache to remove`);
					}
				}),

			/**
			 * Check if a resource is cached
			 */
			isCached: (
				name: string
			): Effect.Effect<boolean, ResourceError | ResourceNotFoundError, FileSystem.FileSystem> =>
				Effect.gen(function* () {
					const resource = yield* getResourceDefinition(name);

					if (isGitResource(resource)) {
						return yield* isGitResourceCached({ resource, resourcesDir });
					} else if (isLocalResource(resource)) {
						return yield* isLocalResourceValid({ resource });
					}

					return false;
				}),

			/**
			 * Get a resource definition by name
			 */
			getDefinition: (name: string): Effect.Effect<ResourceDefinition, ResourceNotFoundError> =>
				getResourceDefinition(name)
		};
	});

export type ResourceService = Effect.Effect.Success<ReturnType<typeof createResourceService>>;

export { createResourceService };
