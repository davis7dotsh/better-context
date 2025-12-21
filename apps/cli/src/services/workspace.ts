import { FileSystem, Path } from '@effect/platform';
import { Effect } from 'effect';
import { ConfigService } from './config.ts';
import { ConfigError } from '../lib/errors.ts';
import { getWorkspaceKey } from '../lib/utils/query.ts';
import { createWorktree, removeWorktree } from '../lib/utils/git.ts';
import { directoryExists, ensureDirectory, removeDirectory } from '../lib/utils/files.ts';

export interface WorkspaceInfo {
	workspacePath: string;
	repos: Array<{
		name: string;
		relativePath: string;
		specialNotes?: string;
	}>;
}

const workspaceService = Effect.gen(function* () {
	const config = yield* ConfigService;
	const pathService = yield* Path.Path;
	const fs = yield* FileSystem.FileSystem;

	/**
	 * Get or create a workspace for the given repos.
	 * Always pulls the central repos first to ensure they're up to date.
	 */
	const ensureWorkspace = (repoNames: string[]) =>
		Effect.gen(function* () {
			if (repoNames.length === 0) {
				return yield* Effect.fail(
					new ConfigError({ message: 'At least one repo must be specified' })
				);
			}

			// Sort repos alphabetically and compute workspace key
			const sortedRepos = [...repoNames].sort();
			const key = getWorkspaceKey(sortedRepos);

			const workspacesDir = yield* config.getWorkspacesDirectory();
			const reposDir = yield* config.getReposDirectory();
			const workspacePath = pathService.join(workspacesDir, key);

			// Get repo configs and validate all repos exist
			const repoConfigs: Array<{
				name: string;
				url: string;
				branch: string;
				specialNotes?: string;
				searchPath?: string;
			}> = [];

			for (const repoName of sortedRepos) {
				const repo = yield* config.getRepo(repoName);
				repoConfigs.push(repo);
			}

			// Pull/clone all central repos first
			for (const repoName of sortedRepos) {
				yield* config.cloneOrUpdateOneRepoLocally(repoName, { suppressLogs: false });
			}

			// Check if workspace already exists
			const workspaceExists = yield* directoryExists(workspacePath);

			if (!workspaceExists) {
				yield* Effect.log(`Creating workspace: ${key}`);
				yield* ensureDirectory(workspacePath);

				// Create worktree for each repo
				for (const repo of repoConfigs) {
					const centralRepoPath = pathService.join(reposDir, repo.name);
					const worktreePath = pathService.join(workspacePath, repo.name);

					yield* Effect.log(`  Adding worktree for ${repo.name}...`);
					yield* createWorktree({
						repoDir: centralRepoPath,
						targetDir: worktreePath,
						ref: `origin/${repo.branch}`
					});
				}

				yield* Effect.log(`Workspace ready: ${workspacePath}`);
			} else {
				yield* Effect.log(`Using existing workspace: ${key}`);
			}

			// Build repo info for the workspace
			const repos = repoConfigs.map((repo) => {
				let relativePath = repo.name;
				// If repo has a searchPath, include it
				if (repo.searchPath) {
					relativePath = pathService.join(repo.name, repo.searchPath);
				}
				return {
					name: repo.name,
					relativePath,
					specialNotes: repo.specialNotes
				};
			});

			return {
				workspacePath,
				repos
			};
		});

	/**
	 * List all workspace keys (directory names in workspaces directory)
	 */
	const listWorkspaces = () =>
		Effect.gen(function* () {
			const workspacesDir = yield* config.getWorkspacesDirectory();

			const exists = yield* directoryExists(workspacesDir);
			if (!exists) {
				return [];
			}

			const entries = yield* fs
				.readDirectory(workspacesDir)
				.pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

			const workspaces: string[] = [];
			for (const entry of entries) {
				const fullPath = pathService.join(workspacesDir, entry);
				const isDir = yield* directoryExists(fullPath);
				if (isDir) {
					workspaces.push(entry);
				}
			}

			return workspaces.sort();
		});

	/**
	 * Clear all workspaces
	 */
	const clearWorkspaces = () =>
		Effect.gen(function* () {
			const workspacesDir = yield* config.getWorkspacesDirectory();
			const reposDir = yield* config.getReposDirectory();
			const workspaces = yield* listWorkspaces();

			for (const workspace of workspaces) {
				yield* clearWorkspaceInternal(workspace, workspacesDir, reposDir);
			}
		});

	/**
	 * Clear a specific workspace by key
	 */
	const clearWorkspace = (key: string) =>
		Effect.gen(function* () {
			const workspacesDir = yield* config.getWorkspacesDirectory();
			const reposDir = yield* config.getReposDirectory();
			yield* clearWorkspaceInternal(key, workspacesDir, reposDir);
		});

	/**
	 * Internal helper to clear a workspace
	 */
	const clearWorkspaceInternal = (key: string, workspacesDir: string, reposDir: string) =>
		Effect.gen(function* () {
			const workspacePath = pathService.join(workspacesDir, key);

			const exists = yield* directoryExists(workspacePath);
			if (!exists) {
				return yield* Effect.fail(new ConfigError({ message: `Workspace "${key}" not found` }));
			}

			// Parse repo names from key
			const repoNames = key.split('+');

			// Remove worktrees from each central repo
			for (const repoName of repoNames) {
				const centralRepoPath = pathService.join(reposDir, repoName);
				const worktreePath = pathService.join(workspacePath, repoName);

				const centralExists = yield* directoryExists(centralRepoPath);
				if (centralExists) {
					yield* removeWorktree({
						repoDir: centralRepoPath,
						worktreeDir: worktreePath
					});
				}
			}

			// Remove the workspace directory
			yield* removeDirectory(workspacePath);
		});

	return {
		ensureWorkspace,
		listWorkspaces,
		clearWorkspaces,
		clearWorkspace
	};
});

export class WorkspaceService extends Effect.Service<WorkspaceService>()('WorkspaceService', {
	effect: workspaceService,
	dependencies: [ConfigService.Default]
}) {}
