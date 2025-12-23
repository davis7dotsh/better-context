import { FileSystem } from '@effect/platform';
import { Effect } from 'effect';
import type { GitResource, ResourceInfo } from '../types.ts';
import { ResourceError } from '../errors.ts';
import { directoryExists } from '../../../lib/utils/files.ts';

/**
 * Clone a git repository
 */
export const cloneRepo = (args: {
	repoDir: string;
	url: string;
	branch: string;
	quiet?: boolean;
}) =>
	Effect.tryPromise({
		try: async () => {
			const { repoDir, url, branch, quiet } = args;
			const proc = Bun.spawn(['git', 'clone', '--depth', '1', '--branch', branch, url, repoDir], {
				stdout: quiet ? 'ignore' : 'inherit',
				stderr: quiet ? 'ignore' : 'inherit'
			});
			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				throw new Error(`git clone failed with exit code ${exitCode}`);
			}
		},
		catch: (error) => new ResourceError({ message: 'Failed to clone repo', cause: error })
	});

/**
 * Pull latest changes for a git repository
 */
export const pullRepo = (args: { repoDir: string; branch: string; quiet?: boolean }) =>
	Effect.tryPromise({
		try: async () => {
			const { repoDir, branch, quiet } = args;

			// Fetch latest
			const fetchProc = Bun.spawn(['git', 'fetch', '--depth', '1', 'origin', branch], {
				cwd: repoDir,
				stdout: quiet ? 'ignore' : 'inherit',
				stderr: quiet ? 'ignore' : 'inherit'
			});
			const fetchExitCode = await fetchProc.exited;
			if (fetchExitCode !== 0) {
				throw new Error(`git fetch failed with exit code ${fetchExitCode}`);
			}

			// Reset to fetched state
			const resetProc = Bun.spawn(['git', 'reset', '--hard', `origin/${branch}`], {
				cwd: repoDir,
				stdout: quiet ? 'ignore' : 'inherit',
				stderr: quiet ? 'ignore' : 'inherit'
			});
			const resetExitCode = await resetProc.exited;
			if (resetExitCode !== 0) {
				throw new Error(`git reset failed with exit code ${resetExitCode}`);
			}
		},
		catch: (error) => new ResourceError({ message: 'Failed to pull repo', cause: error })
	});

/**
 * Ensure a git resource is cached locally.
 * Clones if not present, optionally pulls if already present.
 */
export const ensureGitResource = (args: {
	resource: GitResource;
	resourcesDir: string;
	refresh?: boolean;
	quiet?: boolean;
}): Effect.Effect<ResourceInfo, ResourceError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const { resource, resourcesDir, refresh = false, quiet = false } = args;
		const repoDir = `${resourcesDir}/${resource.name}`;

		const exists = yield* directoryExists(repoDir).pipe(
			Effect.mapError((e) => new ResourceError({ message: e.message, cause: e }))
		);

		if (exists) {
			if (refresh) {
				if (!quiet) yield* Effect.log(`Pulling latest changes for ${resource.name}...`);
				yield* pullRepo({ repoDir, branch: resource.branch, quiet });
			}
		} else {
			if (!quiet) yield* Effect.log(`Cloning ${resource.name}...`);
			yield* cloneRepo({ repoDir, url: resource.url, branch: resource.branch, quiet });
		}

		// Compute final path (may include searchPath)
		let finalPath = repoDir;
		if (resource.searchPath) {
			finalPath = `${repoDir}/${resource.searchPath}`;
		}

		return {
			name: resource.name,
			type: 'git' as const,
			path: finalPath,
			specialNotes: resource.specialNotes
		};
	});

/**
 * Check if a git resource is cached
 */
export const isGitResourceCached = (args: {
	resource: GitResource;
	resourcesDir: string;
}): Effect.Effect<boolean, ResourceError, FileSystem.FileSystem> =>
	directoryExists(`${args.resourcesDir}/${args.resource.name}`).pipe(
		Effect.mapError((e) => new ResourceError({ message: e.message, cause: e }))
	);
