import { Command, Options } from '@effect/cli';
import {
	FileSystem,
	HttpRouter,
	HttpServer,
	HttpServerRequest,
	HttpServerResponse
} from '@effect/platform';
import { BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer, Schema, Stream } from 'effect';
import * as readline from 'readline';
import { OcService, type OcEvent } from './oc.ts';
import { ConfigService } from './config.ts';
import { WorkspaceService } from './workspace.ts';
import { parseQuery, mergeRepos } from '../lib/utils/query.ts';

declare const __VERSION__: string;
const VERSION: string = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';

const programLayer = Layer.mergeAll(
	OcService.Default,
	ConfigService.Default,
	WorkspaceService.Default
);

// === Helper Functions ===

const askConfirmation = (question: string): Effect.Effect<boolean> =>
	Effect.async<boolean>((resume) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		rl.question(question, (answer) => {
			rl.close();
			const normalized = answer.toLowerCase().trim();
			resume(Effect.succeed(normalized === 'y' || normalized === 'yes'));
		});
	});

const askText = (question: string): Effect.Effect<string> =>
	Effect.async<string>((resume) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		rl.question(question, (answer) => {
			rl.close();
			resume(Effect.succeed(answer.trim()));
		});
	});

/**
 * Interactive multi-select for repos
 */
const selectRepos = (availableRepos: string[]): Effect.Effect<string[]> =>
	Effect.gen(function* () {
		console.log('Available repos:');
		availableRepos.forEach((repo, idx) => {
			console.log(`  ${idx + 1}. ${repo}`);
		});
		console.log('');

		const input = yield* askText(
			'Enter repo numbers (comma-separated) or names (space-separated): '
		);

		if (!input) {
			return [];
		}

		// Try to parse as numbers first
		const parts = input.split(/[,\s]+/).filter(Boolean);
		const selected: string[] = [];

		for (const part of parts) {
			const num = parseInt(part, 10);
			if (!isNaN(num) && num >= 1 && num <= availableRepos.length) {
				selected.push(availableRepos[num - 1]!);
			} else if (availableRepos.includes(part.toLowerCase())) {
				selected.push(part.toLowerCase());
			} else if (availableRepos.includes(part)) {
				selected.push(part);
			}
		}

		return [...new Set(selected)];
	});

// === Ask Subcommand ===
const questionOption = Options.text('question').pipe(Options.withAlias('q'));
const noSyncOption = Options.boolean('no-sync').pipe(Options.withAlias('n'));
// Support multiple -t flags
const techOption = Options.text('tech').pipe(Options.withAlias('t'), Options.repeated);

const askCommand = Command.make(
	'ask',
	{ question: questionOption, tech: techOption, noSync: noSyncOption },
	({ question, tech, noSync }) =>
		// TODO: Handle noSync flag
		Effect.gen(function* () {
			const oc = yield* OcService;
			const config = yield* ConfigService;

			// Parse @mentions from question
			const parsed = parseQuery(question);

			// Merge CLI -t flags with @mentions
			let repos = mergeRepos(tech, parsed.repos);

			// If no repos specified, prompt user
			if (repos.length === 0) {
				const availableRepos = yield* config.getRepos();
				const repoNames = availableRepos.map((r) => r.name);

				if (repoNames.length === 0) {
					console.error('No repos configured. Run "btca config repos add" first.');
					process.exit(1);
				}

				repos = yield* selectRepos(repoNames);

				if (repos.length === 0) {
					console.error('No repos selected.');
					process.exit(1);
				}
			}

			// Validate repos exist
			const availableRepos = yield* config.getRepos();
			const availableNames = new Set(availableRepos.map((r) => r.name));
			for (const repo of repos) {
				if (!availableNames.has(repo)) {
					console.error(`Error: Unknown repo "${repo}"`);
					console.error(`Available repos: ${[...availableNames].join(', ')}`);
					process.exit(1);
				}
			}

			console.log(`Searching repos: ${repos.join(', ')}\n`);

			const eventStream = yield* oc.askQuestion({
				repos,
				question: parsed.query,
				suppressLogs: false
			});

			let currentMessageId: string | null = null;

			yield* eventStream.pipe(
				Stream.runForEach((event) =>
					Effect.sync(() => {
						switch (event.type) {
							case 'message.part.updated':
								if (event.properties.part.type === 'text') {
									if (currentMessageId === event.properties.part.messageID) {
										process.stdout.write(event.properties.delta ?? '');
									} else {
										currentMessageId = event.properties.part.messageID;
										process.stdout.write('\n\n' + event.properties.part.text);
									}
								}
								break;
							default:
								break;
						}
					})
				)
			);

			console.log('\n');
		}).pipe(
			Effect.catchTags({
				InvalidProviderError: (e) =>
					Effect.sync(() => {
						console.error(`Error: Unknown provider "${e.providerId}"`);
						console.error(`Available providers: ${e.availableProviders.join(', ')}`);
						process.exit(1);
					}),
				InvalidModelError: (e) =>
					Effect.sync(() => {
						console.error(`Error: Unknown model "${e.modelId}" for provider "${e.providerId}"`);
						console.error(`Available models: ${e.availableModels.join(', ')}`);
						process.exit(1);
					}),
				ProviderNotConnectedError: (e) =>
					Effect.sync(() => {
						console.error(`Error: Provider "${e.providerId}" is not connected`);
						console.error(`Connected providers: ${e.connectedProviders.join(', ')}`);
						console.error(`Run "opencode auth" to configure provider credentials.`);
						process.exit(1);
					}),
				ConfigError: (e) =>
					Effect.sync(() => {
						console.error(`Error: ${e.message}`);
						process.exit(1);
					})
			}),
			Effect.provide(programLayer)
		)
);

// === Chat Subcommand ===
const chatTechOption = Options.text('tech').pipe(Options.withAlias('t'), Options.repeated);

const chatCommand = Command.make('chat', { tech: chatTechOption }, ({ tech }) =>
	Effect.gen(function* () {
		const oc = yield* OcService;
		const config = yield* ConfigService;

		let repos = [...tech];

		// If no repos specified, prompt user
		if (repos.length === 0) {
			const availableRepos = yield* config.getRepos();
			const repoNames = availableRepos.map((r) => r.name);

			if (repoNames.length === 0) {
				console.error('No repos configured. Run "btca config repos add" first.');
				process.exit(1);
			}

			repos = yield* selectRepos(repoNames);

			if (repos.length === 0) {
				console.error('No repos selected.');
				process.exit(1);
			}
		}

		yield* oc.spawnTui({ repos });
	}).pipe(
		Effect.catchTag('ConfigError', (e) =>
			Effect.sync(() => {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			})
		),
		Effect.provide(programLayer)
	)
);

// === Serve Subcommand ===
const QuestionRequest = Schema.Struct({
	repos: Schema.Array(Schema.String),
	question: Schema.String
});

// Legacy format for backwards compatibility
const LegacyQuestionRequest = Schema.Struct({
	tech: Schema.String,
	question: Schema.String
});

const portOption = Options.integer('port').pipe(Options.withAlias('p'), Options.withDefault(8080));

const serveCommand = Command.make('serve', { port: portOption }, ({ port }) =>
	Effect.gen(function* () {
		const router = HttpRouter.empty.pipe(
			HttpRouter.post(
				'/question',
				Effect.gen(function* () {
					const oc = yield* OcService;

					// Try new format first, fall back to legacy
					const body = yield* HttpServerRequest.schemaBodyJson(QuestionRequest).pipe(
						Effect.catchAll(() =>
							HttpServerRequest.schemaBodyJson(LegacyQuestionRequest).pipe(
								Effect.map((legacy) => ({
									repos: [legacy.tech] as string[],
									question: legacy.question
								}))
							)
						)
					);

					const eventStream = yield* oc.askQuestion({
						repos: [...body.repos],
						question: body.question,
						suppressLogs: true
					});

					const chunks: string[] = [];
					let currentMessageId: string | null = null;
					yield* eventStream.pipe(
						Stream.runForEach((event) =>
							Effect.sync(() => {
								switch (event.type) {
									case 'message.part.updated':
										if (event.properties.part.type === 'text') {
											if (currentMessageId === event.properties.part.messageID) {
												chunks[chunks.length - 1] += event.properties.delta ?? '';
											} else {
												currentMessageId = event.properties.part.messageID;
												chunks.push(event.properties.part.text ?? '');
											}
										}
										break;
									default:
										break;
								}
							})
						)
					);

					return yield* HttpServerResponse.json({ answer: chunks.join('') });
				})
			)
		);

		const ServerLive = BunHttpServer.layer({ port });

		const HttpLive = router.pipe(
			HttpServer.serve(),
			HttpServer.withLogAddress,
			Layer.provide(ServerLive)
		);

		return yield* Layer.launch(HttpLive);
	}).pipe(Effect.scoped, Effect.provide(programLayer))
);

// === Config Subcommands ===

// config model - view or set model/provider
const providerOption = Options.text('provider').pipe(Options.withAlias('p'), Options.optional);
const modelOption = Options.text('model').pipe(Options.withAlias('m'), Options.optional);

const configModelCommand = Command.make(
	'model',
	{ provider: providerOption, model: modelOption },
	({ provider, model }) =>
		Effect.gen(function* () {
			const config = yield* ConfigService;

			// If both options provided, update the config
			if (provider._tag === 'Some' && model._tag === 'Some') {
				const result = yield* config.updateModel({
					provider: provider.value,
					model: model.value
				});
				console.log(`Updated model configuration:`);
				console.log(`  Provider: ${result.provider}`);
				console.log(`  Model: ${result.model}`);
			} else if (provider._tag === 'Some' || model._tag === 'Some') {
				// If only one is provided, show an error
				console.error('Error: Both --provider and --model must be specified together');
				process.exit(1);
			} else {
				// No options, show current values
				const current = yield* config.getModel();
				console.log(`Current model configuration:`);
				console.log(`  Provider: ${current.provider}`);
				console.log(`  Model: ${current.model}`);
			}
		}).pipe(Effect.provide(programLayer))
);

// config repos list - list all repos
const configReposListCommand = Command.make('list', {}, () =>
	Effect.gen(function* () {
		const config = yield* ConfigService;
		const repos = yield* config.getRepos();

		if (repos.length === 0) {
			console.log('No repos configured.');
			return;
		}

		console.log('Configured repos:\n');
		for (const repo of repos) {
			console.log(`  ${repo.name}`);
			console.log(`    URL: ${repo.url}`);
			console.log(`    Branch: ${repo.branch}`);
			if (repo.specialNotes) {
				console.log(`    Notes: ${repo.specialNotes}`);
			}
			console.log();
		}
	}).pipe(Effect.provide(programLayer))
);

// config repos add - add a new repo
const repoNameOption = Options.text('name').pipe(Options.withAlias('n'));
const repoUrlOption = Options.text('url').pipe(Options.withAlias('u'));
const repoBranchOption = Options.text('branch').pipe(
	Options.withAlias('b'),
	Options.withDefault('main')
);
const repoNotesOption = Options.text('notes').pipe(Options.optional);

const configReposAddCommand = Command.make(
	'add',
	{
		name: repoNameOption.pipe(Options.optional),
		url: repoUrlOption.pipe(Options.optional),
		branch: repoBranchOption,
		notes: repoNotesOption
	},
	({ name, url, branch, notes }) =>
		Effect.gen(function* () {
			const config = yield* ConfigService;

			let repoName: string;
			if (name._tag === 'Some') {
				repoName = name.value;
			} else {
				repoName = yield* askText('Enter repo name: ');
			}

			if (!repoName) {
				console.log('No repo name provided.');
				return;
			}

			let repoUrl: string;
			if (url._tag === 'Some') {
				repoUrl = url.value;
			} else {
				repoUrl = yield* askText('Enter repo URL: ');
			}

			if (!repoUrl) {
				console.log('No repo URL provided.');
				return;
			}

			const repo = {
				name: repoName,
				url: repoUrl,
				branch,
				...(notes._tag === 'Some' ? { specialNotes: notes.value } : {})
			};

			yield* config.addRepo(repo);
			console.log(`Added repo "${repoName}":`);
			console.log(`  URL: ${repoUrl}`);
			console.log(`  Branch: ${branch}`);
			if (notes._tag === 'Some') {
				console.log(`  Notes: ${notes.value}`);
			}
		}).pipe(
			Effect.catchTag('ConfigError', (e) =>
				Effect.sync(() => {
					console.error(`Error: ${e.message}`);
					process.exit(1);
				})
			),
			Effect.provide(programLayer)
		)
);

const configReposRemoveCommand = Command.make(
	'remove',
	{ name: repoNameOption.pipe(Options.optional) },
	({ name }) =>
		Effect.gen(function* () {
			const config = yield* ConfigService;

			let repoName: string;
			if (name._tag === 'Some') {
				repoName = name.value;
			} else {
				repoName = yield* askText('Enter repo name to remove: ');
			}

			if (!repoName) {
				console.log('No repo name provided.');
				return;
			}

			// Check if repo exists
			const repos = yield* config.getRepos();
			const exists = repos.find((r) => r.name === repoName);
			if (!exists) {
				console.error(`Error: Repo "${repoName}" not found.`);
				process.exit(1);
			}

			const confirmed = yield* askConfirmation(
				`Are you sure you want to remove repo "${repoName}" from config? (y/N): `
			);

			if (!confirmed) {
				console.log('Aborted.');
				return;
			}

			yield* config.removeRepo(repoName);
			console.log(`Removed repo "${repoName}".`);
		}).pipe(
			Effect.catchTag('ConfigError', (e) =>
				Effect.sync(() => {
					console.error(`Error: ${e.message}`);
					process.exit(1);
				})
			),
			Effect.provide(programLayer)
		)
);

const configReposClearCommand = Command.make('clear', {}, () =>
	Effect.gen(function* () {
		const config = yield* ConfigService;
		const fs = yield* FileSystem.FileSystem;

		const reposDir = yield* config.getReposDirectory();

		// Check if repos directory exists
		const exists = yield* fs.exists(reposDir);
		if (!exists) {
			console.log('Repos directory does not exist. Nothing to clear.');
			return;
		}

		// List all directories in the repos directory
		const entries = yield* fs.readDirectory(reposDir);
		const repoPaths: string[] = [];

		for (const entry of entries) {
			const fullPath = `${reposDir}/${entry}`;
			const stat = yield* fs.stat(fullPath);
			if (stat.type === 'Directory') {
				repoPaths.push(fullPath);
			}
		}

		if (repoPaths.length === 0) {
			console.log('No repos found in the repos directory. Nothing to clear.');
			return;
		}

		console.log('The following repos will be deleted:\n');
		for (const repoPath of repoPaths) {
			console.log(`  ${repoPath}`);
		}
		console.log();

		const confirmed = yield* askConfirmation(
			'Are you sure you want to delete these repos? (y/N): '
		);

		if (!confirmed) {
			console.log('Aborted.');
			return;
		}

		for (const repoPath of repoPaths) {
			yield* fs.remove(repoPath, { recursive: true });
			console.log(`Deleted: ${repoPath}`);
		}

		console.log('\nAll repos have been cleared.');
	}).pipe(Effect.provide(programLayer))
);

// config repos - parent command for repo subcommands
const configReposCommand = Command.make('repos', {}, () =>
	Effect.sync(() => {
		console.log('Usage: btca config repos <command>');
		console.log('');
		console.log('Commands:');
		console.log('  list    List all configured repos');
		console.log('  add     Add a new repo');
		console.log('  remove  Remove a configured repo');
		console.log('  clear   Clear all downloaded repos');
	})
).pipe(
	Command.withSubcommands([
		configReposListCommand,
		configReposAddCommand,
		configReposRemoveCommand,
		configReposClearCommand
	])
);

// === Workspace Subcommands ===

const configWorkspacesListCommand = Command.make('list', {}, () =>
	Effect.gen(function* () {
		const workspace = yield* WorkspaceService;
		const workspaces = yield* workspace.listWorkspaces();

		if (workspaces.length === 0) {
			console.log('No workspaces found.');
			return;
		}

		console.log('Workspaces:\n');
		for (const ws of workspaces) {
			console.log(`  ${ws}`);
		}
	}).pipe(
		Effect.catchTag('ConfigError', (e) =>
			Effect.sync(() => {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			})
		),
		Effect.provide(programLayer)
	)
);

const workspaceKeyOption = Options.text('key').pipe(Options.withAlias('k'), Options.optional);

const configWorkspacesClearCommand = Command.make('clear', { key: workspaceKeyOption }, ({ key }) =>
	Effect.gen(function* () {
		const workspace = yield* WorkspaceService;

		if (key._tag === 'Some') {
			yield* workspace.clearWorkspace(key.value);
			console.log(`Cleared workspace: ${key.value}`);
		} else {
			const workspaces = yield* workspace.listWorkspaces();

			if (workspaces.length === 0) {
				console.log('No workspaces to clear.');
				return;
			}

			console.log('The following workspaces will be deleted:\n');
			for (const ws of workspaces) {
				console.log(`  ${ws}`);
			}
			console.log();

			const confirmed = yield* askConfirmation(
				'Are you sure you want to delete all workspaces? (y/N): '
			);

			if (!confirmed) {
				console.log('Aborted.');
				return;
			}

			yield* workspace.clearWorkspaces();
			console.log('All workspaces cleared.');
		}
	}).pipe(
		Effect.catchTag('ConfigError', (e) =>
			Effect.sync(() => {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			})
		),
		Effect.provide(programLayer)
	)
);

const configWorkspacesCommand = Command.make('workspaces', {}, () =>
	Effect.sync(() => {
		console.log('Usage: btca config workspaces <command>');
		console.log('');
		console.log('Commands:');
		console.log('  list    List all workspaces');
		console.log('  clear   Clear workspaces (use --key to clear specific workspace)');
	})
).pipe(Command.withSubcommands([configWorkspacesListCommand, configWorkspacesClearCommand]));

// config - parent command
const configCommand = Command.make('config', {}, () =>
	Effect.gen(function* () {
		const config = yield* ConfigService;
		const configPath = yield* config.getConfigPath();

		console.log(`Config file: ${configPath}`);
		console.log('');
		console.log('Usage: btca config <command>');
		console.log('');
		console.log('Commands:');
		console.log('  model       View or set the model and provider');
		console.log('  repos       Manage configured repos');
		console.log('  workspaces  Manage workspaces');
	}).pipe(Effect.provide(programLayer))
).pipe(Command.withSubcommands([configModelCommand, configReposCommand, configWorkspacesCommand]));

// === Main Command ===
const versionOption = Options.boolean('version').pipe(
	Options.withAlias('v'),
	Options.withDescription('Print the version'),
	Options.withDefault(false)
);

const mainCommand = Command.make('btca', { version: versionOption }, ({ version }) =>
	Effect.sync(() => {
		if (version) {
			console.log(VERSION);
		} else {
			console.log(`btca v${VERSION}. run btca --help for more information.`);
		}
	})
).pipe(Command.withSubcommands([askCommand, serveCommand, chatCommand, configCommand]));

const cliService = Effect.gen(function* () {
	return {
		run: (argv: string[]) =>
			Command.run(mainCommand, {
				name: 'btca',
				version: VERSION
			})(argv)
	};
});

export class CliService extends Effect.Service<CliService>()('CliService', {
	effect: cliService
}) {}

export { type OcEvent };
