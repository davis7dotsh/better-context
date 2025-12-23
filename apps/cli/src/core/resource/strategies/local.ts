import { FileSystem } from '@effect/platform';
import { Effect } from 'effect';
import type { LocalResource, ResourceInfo } from '../types.ts';
import { InvalidResourcePathError, ResourceError } from '../errors.ts';
import { directoryExists } from '../../../lib/utils/files.ts';

/**
 * Ensure a local resource exists.
 * For local resources, we just validate the path exists - no caching needed.
 * The collection will symlink directly to this path.
 */
export const ensureLocalResource = (args: {
	resource: LocalResource;
	quiet?: boolean;
}): Effect.Effect<ResourceInfo, ResourceError | InvalidResourcePathError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const { resource, quiet = false } = args;

		// Validate the path exists
		const exists = yield* directoryExists(resource.path).pipe(
			Effect.mapError((e) => new ResourceError({ message: e.message, cause: e }))
		);

		if (!exists) {
			return yield* Effect.fail(
				new InvalidResourcePathError({
					name: resource.name,
					path: resource.path
				})
			);
		}

		if (!quiet) yield* Effect.log(`Using local resource: ${resource.name} at ${resource.path}`);

		return {
			name: resource.name,
			type: 'local' as const,
			path: resource.path,
			specialNotes: resource.specialNotes
		};
	});

/**
 * Check if a local resource path exists
 */
export const isLocalResourceValid = (args: {
	resource: LocalResource;
}): Effect.Effect<boolean, ResourceError, FileSystem.FileSystem> =>
	directoryExists(args.resource.path).pipe(
		Effect.mapError((e) => new ResourceError({ message: e.message, cause: e }))
	);
