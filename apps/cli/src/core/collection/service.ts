import { FileSystem, Path } from '@effect/platform';
import { Effect } from 'effect';
import type { CollectionInfo } from './types.ts';
import { getCollectionKey } from './types.ts';
import type { ResourceService } from '../resource/service.ts';
import { directoryExists, ensureDirectory, removeDirectory } from '../../lib/utils/files.ts';
import { TaggedError } from 'effect/Data';

export class CollectionError extends TaggedError('CollectionError')<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export interface CollectionServiceConfig {
	collectionsDir: string;
	resourceService: ResourceService;
}

const createCollectionService = (config: CollectionServiceConfig) =>
	Effect.gen(function* () {
		const { collectionsDir, resourceService } = config;
		const pathService = yield* Path.Path;
		const fs = yield* FileSystem.FileSystem;

		// Ensure collections directory exists
		const collectionsDirExists = yield* directoryExists(collectionsDir).pipe(
			Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
		);
		if (!collectionsDirExists) {
			yield* fs
				.makeDirectory(collectionsDir, { recursive: true })
				.pipe(
					Effect.mapError(
						(e) =>
							new CollectionError({ message: 'Failed to create collections directory', cause: e })
					)
				);
		}

		return {
			/**
			 * Ensure a collection exists for the given resources.
			 * Creates symlinks to each resource in the collection directory.
			 */
			ensure: (
				resourceNames: string[],
				options?: { quiet?: boolean }
			): Effect.Effect<CollectionInfo, CollectionError, FileSystem.FileSystem> =>
				Effect.gen(function* () {
					if (resourceNames.length === 0) {
						return yield* Effect.fail(
							new CollectionError({ message: 'Cannot create collection with no resources' })
						);
					}

					const { quiet = false } = options ?? {};
					const sortedNames = [...resourceNames].sort();
					const key = getCollectionKey(sortedNames);
					const collectionPath = pathService.join(collectionsDir, key);

					// Ensure each resource is cached
					for (const name of sortedNames) {
						yield* resourceService
							.ensure(name, { quiet })
							.pipe(Effect.mapError((e) => new CollectionError({ message: e.message, cause: e })));
					}

					// Create collection directory if it doesn't exist
					const collectionExists = yield* directoryExists(collectionPath).pipe(
						Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
					);

					if (!collectionExists) {
						if (!quiet) yield* Effect.log(`Creating collection: ${key}`);
						yield* ensureDirectory(collectionPath).pipe(
							Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
						);

						// Create symlinks for each resource
						for (const name of sortedNames) {
							const resourcePath = yield* resourceService
								.getPath(name)
								.pipe(
									Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
								);
							const linkPath = pathService.join(collectionPath, name);

							// Check if symlink already exists
							const linkExists = yield* fs
								.exists(linkPath)
								.pipe(
									Effect.mapError(
										(e) => new CollectionError({ message: 'Failed to check symlink', cause: e })
									)
								);

							if (!linkExists) {
								yield* fs.symlink(resourcePath, linkPath).pipe(
									Effect.mapError(
										(e) =>
											new CollectionError({
												message: `Failed to create symlink for ${name}`,
												cause: e
											})
									)
								);
								if (!quiet) yield* Effect.log(`  Linked ${name} -> ${resourcePath}`);
							}
						}

						if (!quiet) yield* Effect.log(`Collection ready: ${key}`);
					} else {
						if (!quiet) yield* Effect.log(`Using existing collection: ${key}`);
					}

					return {
						key,
						path: collectionPath,
						resources: sortedNames
					};
				}),

			/**
			 * Get collection key for resource names
			 */
			getKey: (resourceNames: string[]): string => getCollectionKey(resourceNames),

			/**
			 * List all existing collections
			 */
			list: (): Effect.Effect<string[], CollectionError, FileSystem.FileSystem> =>
				Effect.gen(function* () {
					const exists = yield* directoryExists(collectionsDir).pipe(
						Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
					);

					if (!exists) {
						return [];
					}

					const entries = yield* fs
						.readDirectory(collectionsDir)
						.pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

					const collections: string[] = [];
					for (const entry of entries) {
						const fullPath = pathService.join(collectionsDir, entry);
						const isDir = yield* directoryExists(fullPath).pipe(
							Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
						);
						if (isDir) {
							collections.push(entry);
						}
					}

					return collections.sort();
				}),

			/**
			 * Remove a collection by key
			 */
			remove: (key: string): Effect.Effect<void, CollectionError, FileSystem.FileSystem> =>
				Effect.gen(function* () {
					const collectionPath = pathService.join(collectionsDir, key);
					const exists = yield* directoryExists(collectionPath).pipe(
						Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
					);

					if (!exists) {
						return yield* Effect.fail(
							new CollectionError({ message: `Collection "${key}" not found` })
						);
					}

					yield* removeDirectory(collectionPath).pipe(
						Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
					);
					yield* Effect.log(`Removed collection: ${key}`);
				}),

			/**
			 * Remove all collections
			 */
			clear: (): Effect.Effect<void, CollectionError, FileSystem.FileSystem> =>
				Effect.gen(function* () {
					const exists = yield* directoryExists(collectionsDir).pipe(
						Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
					);

					if (!exists) {
						return;
					}

					const entries = yield* fs
						.readDirectory(collectionsDir)
						.pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

					for (const entry of entries) {
						const fullPath = pathService.join(collectionsDir, entry);
						const isDir = yield* directoryExists(fullPath).pipe(
							Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
						);
						if (isDir) {
							yield* removeDirectory(fullPath).pipe(
								Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
							);
							yield* Effect.log(`Removed collection: ${entry}`);
						}
					}
				}),

			/**
			 * Get collection info by key (if it exists)
			 */
			get: (
				key: string
			): Effect.Effect<CollectionInfo | null, CollectionError, FileSystem.FileSystem> =>
				Effect.gen(function* () {
					const collectionPath = pathService.join(collectionsDir, key);
					const exists = yield* directoryExists(collectionPath).pipe(
						Effect.mapError((e) => new CollectionError({ message: e.message, cause: e }))
					);

					if (!exists) {
						return null;
					}

					return {
						key,
						path: collectionPath,
						resources: key.split('+').sort()
					};
				})
		};
	});

export type CollectionService = Effect.Effect.Success<ReturnType<typeof createCollectionService>>;

export { createCollectionService };
