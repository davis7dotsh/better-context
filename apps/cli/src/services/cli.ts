import { Command, Options } from '@effect/cli';
import { BunContext } from '@effect/platform-bun';
import { Effect, Stream } from 'effect';
import * as readline from 'readline';
import { initializeCoreServices, getResourceInfos } from '../core/index.ts';
import type { ResourceDefinition, GitResource, LocalResource } from '../core/resource/types.ts';
import { isGitResource } from '../core/resource/types.ts';

declare const __VERSION__: string;
const VERSION: string = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';

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
 * Interactive multi-select for resources
 */
const selectResources = (availableResources: string[]): Effect.Effect<string[]> =>
	Effect.gen(function* () {
		console.log('Available resources:');
		availableResources.forEach((resource, idx) => {
			console.log(`  ${idx + 1}. ${resource}`);
		});
		console.log('');

		const input = yield* askText(
			'Enter resource numbers (comma-separated) or names (space-separated): '
		);

		if (!input) {
			return [];
		}

		// Try to parse as numbers first
		const parts = input.split(/[,\s]+/).filter(Boolean);
		const selected: string[] = [];

		for (const part of parts) {
			const num = parseInt(part, 10);
			if (!isNaN(num) && num >= 1 && num <= availableResources.length) {
				selected.push(availableResources[num - 1]!);
			} else if (availableResources.includes(part.toLowerCase())) {
				selected.push(part.toLowerCase());
			} else if (availableResources.includes(part)) {
				selected.push(part);
			}
		}

		return [...new Set(selected)];
	});

/**
 * Parse @mentions from query string
 */
const parseQuery = (query: string): { query: string; resources: string[] } => {
	const mentionRegex = /@(\w+)/g;
	const resources: string[] = [];
	let match;

	while ((match = mentionRegex.exec(query)) !== null) {
		resources.push(match[1]!);
	}

	// Remove @mentions from query
	const cleanQuery = query.replace(mentionRegex, '').trim();

	return { query: cleanQuery, resources };
};

/**
 * Merge CLI -r flags with @mentions, deduplicating
 */
const mergeResources = (cliResources: string[], mentionedResources: string[]): string[] => {
	return [...new Set([...cliResources, ...mentionedResources])];
};

// === Ask Subcommand ===
const questionOption = Options.text('question').pipe(Options.withAlias('q'));
const resourceOption = Options.text('resource').pipe(Options.withAlias('r'), Options.repeated);

const askCommand = Command.make(
	'ask',
	{ question: questionOption, resource: resourceOption },
	({ question, resource }) =>
		Effect.gen(function* () {
			const services = yield* initializeCoreServices;

			// Parse @mentions from question
			const parsed = parseQuery(question);

			// Merge CLI -r flags with @mentions
			let resourceNames = mergeResources([...resource], parsed.resources);

			// If no resources specified, prompt user
			if (resourceNames.length === 0) {
				const allResources = yield* services.config.getResources();
				const names = allResources.map((r) => r.name);

				if (names.length === 0) {
					console.error('No resources configured. Run "btca config resources add" first.');
					process.exit(1);
				}

				resourceNames = yield* selectResources(names);

				if (resourceNames.length === 0) {
					console.error('No resources selected.');
					process.exit(1);
				}
			}

			// Validate resources exist
			const allResources = yield* services.config.getResources();
			const availableNames = new Set(allResources.map((r) => r.name));
			for (const name of resourceNames) {
				if (!availableNames.has(name)) {
					console.error(`Error: Unknown resource "${name}"`);
					console.error(`Available resources: ${[...availableNames].join(', ')}`);
					process.exit(1);
				}
			}

			console.log(`Searching resources: ${resourceNames.join(', ')}\n`);

			// Ensure resources and collection
			const resourceInfos = yield* getResourceInfos(services.resources, resourceNames);
			const collection = yield* services.collections.ensure(resourceNames, { quiet: false });

			// Ask the question
			const eventStream = yield* services.agent.ask({
				collection,
				resources: resourceInfos,
				question: parsed.query
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
			Effect.provide(BunContext.layer)
		)
);

// === Chat Subcommand ===
const chatResourceOption = Options.text('resource').pipe(Options.withAlias('r'), Options.repeated);

const chatCommand = Command.make('chat', { resource: chatResourceOption }, ({ resource }) =>
	Effect.gen(function* () {
		const services = yield* initializeCoreServices;

		let resourceNames = [...resource];

		// If no resources specified, prompt user
		if (resourceNames.length === 0) {
			const allResources = yield* services.config.getResources();
			const names = allResources.map((r) => r.name);

			if (names.length === 0) {
				console.error('No resources configured. Run "btca config resources add" first.');
				process.exit(1);
			}

			resourceNames = yield* selectResources(names);

			if (resourceNames.length === 0) {
				console.error('No resources selected.');
				process.exit(1);
			}
		}

		// Ensure resources and collection
		const resourceInfos = yield* getResourceInfos(services.resources, resourceNames);
		const collection = yield* services.collections.ensure(resourceNames, { quiet: false });

		yield* services.agent.spawnTui({ collection, resources: resourceInfos });
	}).pipe(
		Effect.catchTag('ConfigError', (e) =>
			Effect.sync(() => {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			})
		),
		Effect.provide(BunContext.layer)
	)
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
			const services = yield* initializeCoreServices;

			// If both options provided, update the config
			if (provider._tag === 'Some' && model._tag === 'Some') {
				const result = yield* services.config.updateModel({
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
				const current = yield* services.config.getModel();
				console.log(`Current model configuration:`);
				console.log(`  Provider: ${current.provider}`);
				console.log(`  Model: ${current.model}`);
			}
		}).pipe(Effect.provide(BunContext.layer))
);

// config resources list - list all resources
const configResourcesListCommand = Command.make('list', {}, () =>
	Effect.gen(function* () {
		const services = yield* initializeCoreServices;
		const resources = yield* services.config.getResources();

		if (resources.length === 0) {
			console.log('No resources configured.');
			return;
		}

		console.log('Configured resources:\n');
		for (const resource of resources) {
			console.log(`  ${resource.name} (${resource.type})`);
			if (isGitResource(resource)) {
				console.log(`    URL: ${resource.url}`);
				console.log(`    Branch: ${resource.branch}`);
				if (resource.searchPath) {
					console.log(`    Search Path: ${resource.searchPath}`);
				}
			} else {
				console.log(`    Path: ${resource.path}`);
			}
			if (resource.specialNotes) {
				console.log(`    Notes: ${resource.specialNotes}`);
			}
			console.log();
		}
	}).pipe(Effect.provide(BunContext.layer))
);

// config resources add - add a new resource (git or local)
const resourceNameOption = Options.text('name').pipe(Options.withAlias('n'));
const resourceTypeOption = Options.choice('type', ['git', 'local']).pipe(
	Options.withAlias('t'),
	Options.withDefault('git' as const)
);
const resourceUrlOption = Options.text('url').pipe(Options.withAlias('u'), Options.optional);
const resourceBranchOption = Options.text('branch').pipe(
	Options.withAlias('b'),
	Options.withDefault('main')
);
const resourcePathOption = Options.text('path').pipe(Options.optional);
const resourceNotesOption = Options.text('notes').pipe(Options.optional);
const resourceSearchPathOption = Options.text('search-path').pipe(Options.optional);

const configResourcesAddCommand = Command.make(
	'add',
	{
		name: resourceNameOption.pipe(Options.optional),
		type: resourceTypeOption,
		url: resourceUrlOption,
		branch: resourceBranchOption,
		path: resourcePathOption,
		notes: resourceNotesOption,
		searchPath: resourceSearchPathOption
	},
	({ name, type, url, branch, path, notes, searchPath }) =>
		Effect.gen(function* () {
			const services = yield* initializeCoreServices;

			let resourceName: string;
			if (name._tag === 'Some') {
				resourceName = name.value;
			} else {
				resourceName = yield* askText('Enter resource name: ');
			}

			if (!resourceName) {
				console.log('No resource name provided.');
				return;
			}

			let resource: ResourceDefinition;

			if (type === 'git') {
				let resourceUrl: string;
				if (url._tag === 'Some') {
					resourceUrl = url.value;
				} else {
					resourceUrl = yield* askText('Enter git URL: ');
				}

				if (!resourceUrl) {
					console.log('No URL provided.');
					return;
				}

				const gitResource: GitResource = {
					type: 'git',
					name: resourceName,
					url: resourceUrl,
					branch,
					...(notes._tag === 'Some' ? { specialNotes: notes.value } : {}),
					...(searchPath._tag === 'Some' ? { searchPath: searchPath.value } : {})
				};
				resource = gitResource;
			} else {
				let resourcePath: string;
				if (path._tag === 'Some') {
					resourcePath = path.value;
				} else {
					resourcePath = yield* askText('Enter local path: ');
				}

				if (!resourcePath) {
					console.log('No path provided.');
					return;
				}

				const localResource: LocalResource = {
					type: 'local',
					name: resourceName,
					path: resourcePath,
					...(notes._tag === 'Some' ? { specialNotes: notes.value } : {})
				};
				resource = localResource;
			}

			yield* services.config.addResource(resource);
			console.log(`Added ${type} resource "${resourceName}"`);

			if (isGitResource(resource)) {
				console.log(`  URL: ${resource.url}`);
				console.log(`  Branch: ${resource.branch}`);
			} else {
				console.log(`  Path: ${resource.path}`);
			}
		}).pipe(
			Effect.catchTag('ConfigError', (e) =>
				Effect.sync(() => {
					console.error(`Error: ${e.message}`);
					process.exit(1);
				})
			),
			Effect.provide(BunContext.layer)
		)
);

const configResourcesRemoveCommand = Command.make(
	'remove',
	{ name: resourceNameOption.pipe(Options.optional) },
	({ name }) =>
		Effect.gen(function* () {
			const services = yield* initializeCoreServices;

			let resourceName: string;
			if (name._tag === 'Some') {
				resourceName = name.value;
			} else {
				resourceName = yield* askText('Enter resource name to remove: ');
			}

			if (!resourceName) {
				console.log('No resource name provided.');
				return;
			}

			// Check if resource exists
			const resources = yield* services.config.getResources();
			const exists = resources.find((r) => r.name === resourceName);
			if (!exists) {
				console.error(`Error: Resource "${resourceName}" not found.`);
				process.exit(1);
			}

			const confirmed = yield* askConfirmation(
				`Are you sure you want to remove resource "${resourceName}" from config? (y/N): `
			);

			if (!confirmed) {
				console.log('Aborted.');
				return;
			}

			yield* services.config.removeResource(resourceName);
			console.log(`Removed resource "${resourceName}".`);
		}).pipe(
			Effect.catchTag('ConfigError', (e) =>
				Effect.sync(() => {
					console.error(`Error: ${e.message}`);
					process.exit(1);
				})
			),
			Effect.provide(BunContext.layer)
		)
);

// config resources - parent command for resource subcommands
const configResourcesCommand = Command.make('resources', {}, () =>
	Effect.sync(() => {
		console.log('Usage: btca config resources <command>');
		console.log('');
		console.log('Commands:');
		console.log('  list    List all configured resources');
		console.log('  add     Add a new resource');
		console.log('  remove  Remove a configured resource');
	})
).pipe(
	Command.withSubcommands([
		configResourcesListCommand,
		configResourcesAddCommand,
		configResourcesRemoveCommand
	])
);

// === Collections Subcommands ===

const configCollectionsListCommand = Command.make('list', {}, () =>
	Effect.gen(function* () {
		const services = yield* initializeCoreServices;
		const collections = yield* services.collections.list();

		if (collections.length === 0) {
			console.log('No collections found.');
			return;
		}

		console.log('Collections:\n');
		for (const collection of collections) {
			console.log(`  ${collection}`);
		}
	}).pipe(
		Effect.catchTag('CollectionError', (e) =>
			Effect.sync(() => {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			})
		),
		Effect.provide(BunContext.layer)
	)
);

const collectionKeyOption = Options.text('key').pipe(Options.withAlias('k'), Options.optional);

const configCollectionsClearCommand = Command.make(
	'clear',
	{ key: collectionKeyOption },
	({ key }) =>
		Effect.gen(function* () {
			const services = yield* initializeCoreServices;

			if (key._tag === 'Some') {
				yield* services.collections.remove(key.value);
				console.log(`Cleared collection: ${key.value}`);
			} else {
				const collections = yield* services.collections.list();

				if (collections.length === 0) {
					console.log('No collections to clear.');
					return;
				}

				console.log('The following collections will be deleted:\n');
				for (const collection of collections) {
					console.log(`  ${collection}`);
				}
				console.log();

				const confirmed = yield* askConfirmation(
					'Are you sure you want to delete all collections? (y/N): '
				);

				if (!confirmed) {
					console.log('Aborted.');
					return;
				}

				yield* services.collections.clear();
				console.log('All collections cleared.');
			}
		}).pipe(
			Effect.catchTag('CollectionError', (e) =>
				Effect.sync(() => {
					console.error(`Error: ${e.message}`);
					process.exit(1);
				})
			),
			Effect.provide(BunContext.layer)
		)
);

const configCollectionsCommand = Command.make('collections', {}, () =>
	Effect.sync(() => {
		console.log('Usage: btca config collections <command>');
		console.log('');
		console.log('Commands:');
		console.log('  list    List all collections');
		console.log('  clear   Clear collections (use --key to clear specific collection)');
	})
).pipe(Command.withSubcommands([configCollectionsListCommand, configCollectionsClearCommand]));

// === Threads Subcommands ===

const configThreadsListCommand = Command.make('list', {}, () =>
	Effect.gen(function* () {
		const services = yield* initializeCoreServices;
		const threads = yield* services.threads.list();

		if (threads.length === 0) {
			console.log('No threads found.');
			return;
		}

		console.log('Threads:\n');
		for (const thread of threads) {
			console.log(`  ${thread.id}`);
			console.log(`    Questions: ${thread.questionCount}`);
			console.log(`    Resources: ${thread.resources.join(', ') || 'none'}`);
			if (thread.firstPrompt) {
				const preview =
					thread.firstPrompt.length > 50
						? thread.firstPrompt.slice(0, 50) + '...'
						: thread.firstPrompt;
				console.log(`    First: "${preview}"`);
			}
			console.log(`    Created: ${thread.createdAt.toISOString()}`);
			console.log();
		}
	}).pipe(
		Effect.catchTag('ThreadRepositoryError', (e) =>
			Effect.sync(() => {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			})
		),
		Effect.provide(BunContext.layer)
	)
);

const threadIdOption = Options.text('id').pipe(Options.optional);

const configThreadsDeleteCommand = Command.make('delete', { id: threadIdOption }, ({ id }) =>
	Effect.gen(function* () {
		const services = yield* initializeCoreServices;

		let threadId: string;
		if (id._tag === 'Some') {
			threadId = id.value;
		} else {
			threadId = yield* askText('Enter thread ID to delete: ');
		}

		if (!threadId) {
			console.log('No thread ID provided.');
			return;
		}

		const thread = yield* services.threads.get(threadId);
		if (!thread) {
			console.error(`Error: Thread "${threadId}" not found.`);
			process.exit(1);
		}

		const confirmed = yield* askConfirmation(
			`Are you sure you want to delete thread "${threadId}"? (y/N): `
		);

		if (!confirmed) {
			console.log('Aborted.');
			return;
		}

		yield* services.threads.delete(threadId);
		console.log(`Deleted thread "${threadId}".`);
	}).pipe(
		Effect.catchTag('ThreadRepositoryError', (e) =>
			Effect.sync(() => {
				console.error(`Error: ${e.message}`);
				process.exit(1);
			})
		),
		Effect.provide(BunContext.layer)
	)
);

const configThreadsCommand = Command.make('threads', {}, () =>
	Effect.sync(() => {
		console.log('Usage: btca config threads <command>');
		console.log('');
		console.log('Commands:');
		console.log('  list    List all threads');
		console.log('  delete  Delete a thread');
	})
).pipe(Command.withSubcommands([configThreadsListCommand, configThreadsDeleteCommand]));

// config - parent command
const configCommand = Command.make('config', {}, () =>
	Effect.gen(function* () {
		const services = yield* initializeCoreServices;
		const configPath = yield* services.config.getConfigPath();

		console.log(`Config file: ${configPath}`);
		console.log('');
		console.log('Usage: btca config <command>');
		console.log('');
		console.log('Commands:');
		console.log('  model        View or set the model and provider');
		console.log('  resources    Manage configured resources');
		console.log('  collections  Manage collections');
		console.log('  threads      Manage conversation threads');
	}).pipe(Effect.provide(BunContext.layer))
).pipe(
	Command.withSubcommands([
		configModelCommand,
		configResourcesCommand,
		configCollectionsCommand,
		configThreadsCommand
	])
);

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
).pipe(Command.withSubcommands([askCommand, chatCommand, configCommand]));

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
