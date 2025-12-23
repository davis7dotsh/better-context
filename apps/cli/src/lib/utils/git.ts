import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import { directoryExists, fileExists, removeDirectory } from './files.ts';

export class GitError extends TaggedError('GitError')<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

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
		catch: (error) => new GitError({ message: 'Failed to clone repo', cause: error })
	});

export const pullRepo = (args: { repoDir: string; branch: string; quiet?: boolean }) =>
	Effect.tryPromise({
		try: async () => {
			const { repoDir, branch, quiet } = args;
			const fetchProc = Bun.spawn(['git', 'fetch', '--depth', '1', 'origin', branch], {
				cwd: repoDir,
				stdout: quiet ? 'ignore' : 'inherit',
				stderr: quiet ? 'ignore' : 'inherit'
			});
			const fetchExitCode = await fetchProc.exited;
			if (fetchExitCode !== 0) {
				throw new Error(`git fetch failed with exit code ${fetchExitCode}`);
			}

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
		catch: (error) => new GitError({ message: 'Failed to pull repo', cause: error })
	});

/**
 * Check if a directory is a git worktree
 * Worktrees have a .git file (not directory) that points to the main repo
 */
export const isWorktree = (dir: string) =>
	Effect.gen(function* () {
		const gitPath = `${dir}/.git`;
		// Worktrees have a .git file, regular repos have a .git directory
		const isFile = yield* fileExists(gitPath);
		const isDir = yield* directoryExists(gitPath);
		return isFile && !isDir;
	});

/**
 * Check if a worktree exists at the given path
 */
export const worktreeExists = (targetDir: string) =>
	Effect.gen(function* () {
		const dirExists = yield* directoryExists(targetDir);
		if (!dirExists) return false;
		return yield* isWorktree(targetDir);
	});

/**
 * Create a git worktree from a repository
 *
 * @param repoDir - Path to the main git repository
 * @param targetDir - Path where the worktree should be created
 * @param ref - Git ref to checkout (branch, tag, commit). Defaults to HEAD
 */
export const createWorktree = (args: { repoDir: string; targetDir: string; ref?: string }) =>
	Effect.tryPromise({
		try: async () => {
			const { repoDir, targetDir, ref = 'HEAD' } = args;

			// git worktree add --detach <targetDir> <ref>
			// --detach creates a detached HEAD, avoiding branch conflicts
			const proc = Bun.spawn(['git', 'worktree', 'add', '--detach', targetDir, ref], {
				cwd: repoDir,
				stdout: 'pipe',
				stderr: 'pipe'
			});

			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				const stderr = await new Response(proc.stderr).text();
				throw new Error(`git worktree add failed: ${stderr}`);
			}
		},
		catch: (error) => new GitError({ message: 'Failed to create worktree', cause: error })
	});

/**
 * Remove a git worktree
 *
 * @param repoDir - Path to the main git repository
 * @param worktreeDir - Path to the worktree to remove
 */
export const removeWorktree = (args: { repoDir: string; worktreeDir: string }) =>
	Effect.gen(function* () {
		const { repoDir, worktreeDir } = args;

		// First try to remove via git
		yield* Effect.tryPromise({
			try: async () => {
				const proc = Bun.spawn(['git', 'worktree', 'remove', '--force', worktreeDir], {
					cwd: repoDir,
					stdout: 'pipe',
					stderr: 'pipe'
				});
				await proc.exited;
				// Ignore exit code - we'll clean up manually if needed
			},
			catch: () => new GitError({ message: 'git worktree remove failed' })
		}).pipe(Effect.catchAll(() => Effect.void));

		// Also clean up the directory if it still exists
		yield* removeDirectory(worktreeDir);

		// Prune any stale worktree references
		yield* Effect.tryPromise({
			try: async () => {
				const proc = Bun.spawn(['git', 'worktree', 'prune'], {
					cwd: repoDir,
					stdout: 'pipe',
					stderr: 'pipe'
				});
				await proc.exited;
			},
			catch: () => new GitError({ message: 'git worktree prune failed' })
		}).pipe(Effect.catchAll(() => Effect.void));
	});

/**
 * List all worktrees for a repository
 */
export const listWorktrees = (repoDir: string) =>
	Effect.tryPromise({
		try: async () => {
			const proc = Bun.spawn(['git', 'worktree', 'list', '--porcelain'], {
				cwd: repoDir,
				stdout: 'pipe',
				stderr: 'pipe'
			});

			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				return [];
			}

			const output = await new Response(proc.stdout).text();
			const worktrees: string[] = [];

			// Parse porcelain output - each worktree starts with "worktree <path>"
			for (const line of output.split('\n')) {
				if (line.startsWith('worktree ')) {
					worktrees.push(line.slice('worktree '.length));
				}
			}

			return worktrees;
		},
		catch: (error) => new GitError({ message: 'Failed to list worktrees', cause: error })
	});
