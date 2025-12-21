import type { Config as OpenCodeConfig, ProviderConfig } from '@opencode-ai/sdk';
import { FileSystem, Path } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { getDocsAgentPrompt } from '../lib/prompts.ts';
import { ConfigError } from '../lib/errors.ts';
import { cloneRepo, pullRepo } from '../lib/utils/git.ts';
import { directoryExists, expandHome } from '../lib/utils/files.ts';
import { BLESSED_MODELS } from '@btca/shared';

const CONFIG_DIRECTORY = '~/.config/btca';
const CONFIG_FILENAME = 'btca.json';

const repoSchema = Schema.Struct({
	name: Schema.String,
	url: Schema.String,
	branch: Schema.String,
	specialNotes: Schema.String.pipe(Schema.optional),
	searchPath: Schema.String.pipe(Schema.optional)
});

const configSchema = Schema.Struct({
	reposDirectory: Schema.String,
	port: Schema.Number,
	maxInstances: Schema.Number,
	repos: Schema.Array(repoSchema),
	model: Schema.String,
	provider: Schema.String
});

type Config = typeof configSchema.Type;
type Repo = typeof repoSchema.Type;

const DEFAULT_CONFIG: Config = {
	reposDirectory: '~/.local/share/btca/repos',
	port: 3420,
	maxInstances: 5,
	repos: [
		{
			name: 'svelte',
			url: 'https://github.com/sveltejs/svelte.dev',
			branch: 'main',
			specialNotes:
				'This is the svelte docs website repo, not the actual svelte repo. Use the docs to answer questions about svelte.'
		},
		{
			name: 'tailwindcss',
			url: 'https://github.com/tailwindlabs/tailwindcss.com',
			branch: 'main',
			specialNotes:
				'This is the tailwindcss docs website repo, not the actual tailwindcss repo. Use the docs to answer questions about tailwindcss.'
		},
		{
			name: 'nextjs',
			url: 'https://github.com/vercel/next.js',
			branch: 'canary'
		}
	],
	model: 'big-pickle',
	provider: 'opencode'
};

const collapseHome = (path: string): string => {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
	if (home && path.startsWith(home)) {
		return '~' + path.slice(home.length);
	}
	return path;
};

const writeConfig = (config: Config) =>
	Effect.gen(function* () {
		const path = yield* Path.Path;
		const fs = yield* FileSystem.FileSystem;

		const configDir = yield* expandHome(CONFIG_DIRECTORY);
		const configPath = path.join(configDir, CONFIG_FILENAME);

		// Collapse expanded paths back to tilde for storage
		const configToWrite: Config = {
			...config,
			reposDirectory: collapseHome(config.reposDirectory)
		};

		yield* fs.writeFileString(configPath, JSON.stringify(configToWrite, null, 2)).pipe(
			Effect.catchAll((error) =>
				Effect.fail(
					new ConfigError({
						message: 'Failed to write config',
						cause: error
					})
				)
			)
		);

		return configToWrite;
	});

// models setup the way I like them, the ones I would recommend for use are:
// gemini 3 flash with low reasoning, haiku 4.5 with no reasoning, big pickle (surprisingly good), and kimi K2
const BTCA_PRESET_MODELS: Record<string, ProviderConfig> = {
	opencode: {
		models: {
			'btca-gemini-3-flash': {
				id: 'gemini-3-flash',
				options: {
					generationConfig: {
						thinkingConfig: {
							thinkingLevel: 'low'
						}
					}
				}
			}
		}
	}
};

const OPENCODE_CONFIG = (args: {
	repoName: string;
	specialNotes?: string;
}): Effect.Effect<OpenCodeConfig, never, Path.Path> =>
	Effect.gen(function* () {
		return {
			provider: BTCA_PRESET_MODELS,
			agent: {
				build: {
					disable: true
				},
				explore: {
					disable: true
				},
				general: {
					disable: true
				},
				plan: {
					disable: true
				},
				docs: {
					prompt: getDocsAgentPrompt({
						repoName: args.repoName,
						specialNotes: args.specialNotes
					}),
					disable: false,
					description: 'Get answers about libraries and frameworks by searching their source code',
					permission: {
						webfetch: 'deny',
						edit: 'deny',
						bash: 'deny',
						external_directory: 'deny',
						doom_loop: 'deny'
					},
					mode: 'primary',
					tools: {
						write: false,
						bash: false,
						delete: false,
						read: true,
						grep: true,
						glob: true,
						list: true,
						path: false,
						todowrite: false,
						todoread: false,
						websearch: false
					}
				}
			}
		};
	});

const onStartLoadConfig = Effect.gen(function* () {
	const path = yield* Path.Path;
	const fs = yield* FileSystem.FileSystem;

	const configDir = yield* expandHome(CONFIG_DIRECTORY);
	const configPath = path.join(configDir, CONFIG_FILENAME);

	const exists = yield* fs.exists(configPath);

	if (!exists) {
		yield* Effect.log(`Config file not found at ${configPath}, creating default config...`);
		// Ensure directory exists
		yield* fs
			.makeDirectory(configDir, { recursive: true })
			.pipe(Effect.catchAll(() => Effect.void));
		yield* fs.writeFileString(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2)).pipe(
			Effect.catchAll((error) =>
				Effect.fail(
					new ConfigError({
						message: 'Failed to create default config',
						cause: error
					})
				)
			)
		);
		yield* Effect.log(`Default config created at ${configPath}`);
		const reposDir = yield* expandHome(DEFAULT_CONFIG.reposDirectory);
		const config = {
			...DEFAULT_CONFIG,
			reposDirectory: reposDir
		} satisfies Config;
		return {
			config,
			configPath
		};
	} else {
		const content = yield* fs.readFileString(configPath).pipe(
			Effect.catchAll((error) =>
				Effect.fail(
					new ConfigError({
						message: 'Failed to load config',
						cause: error
					})
				)
			)
		);
		const parsed = JSON.parse(content);
		return yield* Effect.succeed(parsed).pipe(
			Effect.flatMap(Schema.decode(configSchema)),
			Effect.flatMap((loadedConfig) =>
				Effect.gen(function* () {
					const reposDir = yield* expandHome(loadedConfig.reposDirectory);
					const config = {
						...loadedConfig,
						reposDirectory: reposDir
					} satisfies Config;
					return {
						config,
						configPath
					};
				})
			)
		);
	}
});

const configService = Effect.gen(function* () {
	const path = yield* Path.Path;
	const loadedConfig = yield* onStartLoadConfig;

	let { config, configPath } = loadedConfig;

	const getRepo = ({ repoName, config }: { repoName: string; config: Config }) =>
		Effect.gen(function* () {
			const repo = config.repos.find((repo) => repo.name === repoName);
			if (!repo) {
				return yield* Effect.fail(new ConfigError({ message: 'Repo not found' }));
			}
			return repo;
		});

	return {
		getConfigPath: () => Effect.succeed(configPath),
		cloneOrUpdateOneRepoLocally: (repoName: string, options: { suppressLogs: boolean }) =>
			Effect.gen(function* () {
				const repo = yield* getRepo({ repoName, config });
				const repoDir = path.join(config.reposDirectory, repo.name);
				const branch = repo.branch ?? 'main';
				const suppressLogs = options.suppressLogs;

				const exists = yield* directoryExists(repoDir);
				if (exists) {
					if (!suppressLogs) yield* Effect.log(`Pulling latest changes for ${repo.name}...`);
					yield* pullRepo({ repoDir, branch, quiet: suppressLogs });
				} else {
					if (!suppressLogs) yield* Effect.log(`Cloning ${repo.name}...`);
					yield* cloneRepo({ repoDir, url: repo.url, branch, quiet: suppressLogs });
				}
				if (!suppressLogs) yield* Effect.log(`Done with ${repo.name}`);
				return repo;
			}),
		getOpenCodeConfig: (args: { repoName: string }) =>
			Effect.gen(function* () {
				const repo = yield* getRepo({ repoName: args.repoName, config });

				const ocConfig = yield* OPENCODE_CONFIG({
					repoName: args.repoName,
					specialNotes: repo?.specialNotes
				});

				let repoDir = path.join(config.reposDirectory, args.repoName);

				if (repo.searchPath) {
					repoDir = path.join(repoDir, repo.searchPath);
				}

				return {
					ocConfig,
					repoDir
				};
			}),
		rawConfig: () => Effect.succeed(config),
		getRepos: () => Effect.succeed(config.repos),
		getModel: () => Effect.succeed({ provider: config.provider, model: config.model }),
		updateModel: (args: { provider: string; model: string }) =>
			Effect.gen(function* () {
				config = { ...config, provider: args.provider, model: args.model };
				yield* writeConfig(config);
				return { provider: config.provider, model: config.model };
			}),
		addRepo: (repo: Repo) =>
			Effect.gen(function* () {
				const existing = config.repos.find((r) => r.name === repo.name);
				if (existing) {
					return yield* Effect.fail(
						new ConfigError({ message: `Repo "${repo.name}" already exists` })
					);
				}
				config = { ...config, repos: [...config.repos, repo] };
				yield* writeConfig(config);
				return repo;
			}),
		getBlessedModels: () => Effect.succeed(BLESSED_MODELS),
		removeRepo: (repoName: string) =>
			Effect.gen(function* () {
				const existing = config.repos.find((r) => r.name === repoName);
				if (!existing) {
					return yield* Effect.fail(new ConfigError({ message: `Repo "${repoName}" not found` }));
				}
				config = { ...config, repos: config.repos.filter((r) => r.name !== repoName) };
				yield* writeConfig(config);
			}),
		getReposDirectory: () => Effect.succeed(config.reposDirectory)
	};
});

export class ConfigService extends Effect.Service<ConfigService>()('ConfigService', {
	effect: configService
}) {}
