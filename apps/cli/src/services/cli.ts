import { Command, Options } from '@effect/cli';
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { BunHttpServer } from '@effect/platform-bun';
import { Effect, Layer, Schema, Stream } from 'effect';
import { spinnerFrames, startSpinner } from '../lib/utils/spinner.ts';
import { ConfigService } from './config.ts';
import { OcService, type OcEvent } from './oc.ts';

declare const __VERSION__: string;
const VERSION: string = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.0.0-dev';

const programLayer = Layer.mergeAll(OcService.Default, ConfigService.Default);

type MessageState = {
	suppressed: boolean;
	printedChars: number;
	lastSeen: number;
};

const MESSAGE_STATE_TTL_MS = 60_000;

type PlanningLineHandle = {
	show: (text: string) => Effect.Effect<void>;
	clear: () => Effect.Effect<void>;
	complete: () => Effect.Effect<void>;
	isActive: () => boolean;
};

const sanitizePlanningText = (text: string) =>
	text
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[:：]\s*$/, '');

const CHECKMARK = '\x1b[32m✓\x1b[0m';

const makePlanningLine = (): Effect.Effect<PlanningLineHandle> =>
	Effect.acquireRelease(
		Effect.sync((): PlanningLineHandle => {
			let timer: ReturnType<typeof setInterval> | null = null;
			let active = false;
			let text = '';
			let frameIndex = 0;
			let visibleChars = 0;

			const render = () => {
				if (!active || text.length === 0) {
					return;
				}
				const frame = spinnerFrames[frameIndex % spinnerFrames.length];
				frameIndex += 1;
				const line = `${frame} ${text}`;
				const width = text.length + 2;
				const paddingWidth = Math.max(visibleChars - width, 0);
				const padding = paddingWidth > 0 ? ' '.repeat(paddingWidth) : '';
				process.stdout.write(`\r${line}${padding}`);
				visibleChars = width;
			};

				const stopTimer = () => {
					if (timer) {
						clearInterval(timer);
						timer = null;
					}
				};

				const reset = () => {
					active = false;
					visibleChars = 0;
					text = '';
				};

				return {
					show: (rawText: string) =>
						Effect.sync(() => {
							const sanitized = sanitizePlanningText(rawText);
							if (sanitized.length === 0) {
								return;
						}
						text = sanitized;
						if (!active) {
							active = true;
							frameIndex = 0;
							visibleChars = 0;
							process.stdout.write('\n');
							render();
							timer = setInterval(render, 100);
						} else {
							render();
						}
					}),
					clear: () =>
						Effect.sync(() => {
							if (!active) {
								return;
							}
							stopTimer();
							process.stdout.write(`\r${' '.repeat(visibleChars + 2)}\r`);
							reset();
						}),
					complete: () =>
						Effect.sync(() => {
							if (!active) {
								return;
							}
							stopTimer();
							const visibleWidth = text.length + 2;
							const padding =
								visibleWidth < visibleChars + 2
									? ' '.repeat(visibleChars + 2 - visibleWidth)
									: '';
							const line = `${CHECKMARK} ${text}`;
							process.stdout.write(`\r${line}${padding}\n`);
							reset();
						}),
					isActive: () => active
				};
			}),
		(handle) => handle.clear()
	);

// === Ask Subcommand ===
const questionOption = Options.text('question').pipe(Options.withAlias('q'));
const techOption = Options.text('tech').pipe(Options.withAlias('t'));
const askCommand = Command.make(
	'ask',
	{ question: questionOption, tech: techOption },
	({ question, tech }) =>
		Effect.gen(function* () {
			const oc = yield* OcService;
			const eventStream = yield* oc.askQuestion({ tech, question });
			const spinner = yield* startSpinner('Parsing repo...');
			const planningLine = yield* makePlanningLine().pipe(Effect.scoped);

			let hasPrintedAnswer = false;
			let spinnerStopped = false;
			const messageStates = new Map<string, MessageState>();
			const normalizedQuestion = question.trim();

			const stopSpinner = () =>
				Effect.gen(function* () {
					if (spinnerStopped) {
						return;
					}
					spinnerStopped = true;
					yield* spinner.stop();
				});

			const getMessageState = (messageId: string, now: number) => {
				const existing = messageStates.get(messageId);
				if (existing) {
					existing.lastSeen = now;
					return existing;
				}
				const initial: MessageState = {
					suppressed: true,
					printedChars: 0,
					lastSeen: now
				};
				messageStates.set(messageId, initial);
				return initial;
			};

			const cleanupMessageStates = (now: number) => {
				for (const [id, state] of messageStates) {
					if (now - state.lastSeen > MESSAGE_STATE_TTL_MS) {
						messageStates.delete(id);
					}
				}
			};

			const ensureAnswerSpacing = (options?: { hadPlanningLine?: boolean }) =>
				Effect.gen(function* () {
					if (!hasPrintedAnswer) {
						hasPrintedAnswer = true;
						yield* stopSpinner();
						if (options?.hadPlanningLine) {
							process.stdout.write('\n');
						}
						process.stdout.write('\n');
					}
				});

			const showPlanningLine = (text: string) =>
				Effect.gen(function* () {
					yield* stopSpinner();
					yield* planningLine.show(text);
				});

			const clearPlanningLine = (options?: { completed?: boolean }) =>
				options?.completed ? planningLine.complete() : planningLine.clear();

			const shouldSuppressText = (text: string) => {
				const trimmed = text.trim();
				if (trimmed.length === 0) {
					return true;
				}
				if (trimmed === normalizedQuestion) {
					return true;
				}

				const fillerPrefixes = [
					"i'll",
					'let me',
					'searching',
					'checking',
					'looking',
					'exploring',
					'finding',
					'gathering',
					'analyzing'
				];
				const lower = trimmed.toLowerCase();
				const matchesFiller = fillerPrefixes.some(
					(prefix) => lower.startsWith(prefix) || prefix.startsWith(lower)
				);

				if (!matchesFiller) {
					return false;
				}

				const hasSubstantiveContent =
					trimmed.length > 200 ||
					trimmed.includes('\n\n') ||
					trimmed.includes('##') ||
					trimmed.includes('```') ||
					trimmed.includes('* ') ||
					trimmed.includes('- ') ||
					/\d+\./.test(trimmed);

				return !hasSubstantiveContent;
			};

			yield* eventStream
				.pipe(
					Stream.runForEach((event) =>
						Effect.gen(function* () {
							if (event.type !== 'message.part.updated') {
								return;
							}
							const part = event.properties.part;
							if (part.type !== 'text') {
								return;
							}

							const messageId = part.messageID;
							const text = part.text ?? '';
							const now = Date.now();
							const state = getMessageState(messageId, now);
							const cleanup = Effect.sync(() => cleanupMessageStates(now));

							let justUnsuppressed = false;
							if (state.suppressed) {
								const shouldStaySuppressed = shouldSuppressText(text);
								if (shouldStaySuppressed) {
									state.printedChars = text.length;
									yield* showPlanningLine(text);
									yield* cleanup;
									return;
								}
								state.suppressed = false;
								justUnsuppressed = true;
							}

							let planningLineWasActive = false;
							if (justUnsuppressed) {
								if (planningLine.isActive()) {
									planningLineWasActive = true;
								}
								yield* clearPlanningLine({ completed: true });
							}

							const delta = event.properties.delta ?? '';
							let chunk = delta;
							if (chunk.length === 0 && text.length > state.printedChars) {
								chunk = text.slice(state.printedChars);
							}
							if (chunk.length === 0) {
								yield* cleanup;
								return;
							}

							yield* ensureAnswerSpacing({ hadPlanningLine: planningLineWasActive });
							process.stdout.write(chunk);
							if (delta.length > 0) {
								state.printedChars += chunk.length;
							} else if (text.length > state.printedChars) {
								state.printedChars = text.length;
							}

							yield* cleanup;
						})
					)
				)
				.pipe(
					Effect.ensuring(
						Effect.gen(function* () {
							yield* clearPlanningLine();
							yield* stopSpinner();
							yield* Effect.sync(() => messageStates.clear());
						})
					)
				);

			console.log('\n');
		}).pipe(
			Effect.scoped,
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
					})
			}),
			Effect.provide(programLayer)
		)
);

// === Open Subcommand ===
const openCommand = Command.make('open', {}, () =>
	Effect.gen(function* () {
		const oc = yield* OcService;
		yield* oc.holdOpenInstanceInBg();
	}).pipe(Effect.provide(programLayer))
);

// === Chat Subcommand ===
const chatTechOption = Options.text('tech').pipe(Options.withAlias('t'));

const chatCommand = Command.make('chat', { tech: chatTechOption }, ({ tech }) =>
	Effect.gen(function* () {
		const oc = yield* OcService;
		yield* oc.spawnTui({ tech });
	}).pipe(Effect.provide(programLayer))
);

// === Serve Subcommand ===
const QuestionRequest = Schema.Struct({
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
					const body = yield* HttpServerRequest.schemaBodyJson(QuestionRequest);
					const oc = yield* OcService;

					const eventStream = yield* oc.askQuestion({
						tech: body.tech,
						question: body.question
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
		name: repoNameOption,
		url: repoUrlOption,
		branch: repoBranchOption,
		notes: repoNotesOption
	},
	({ name, url, branch, notes }) =>
		Effect.gen(function* () {
			const config = yield* ConfigService;

			const repo = {
				name,
				url,
				branch,
				...(notes._tag === 'Some' ? { specialNotes: notes.value } : {})
			};

			yield* config.addRepo(repo);
			console.log(`Added repo "${name}":`);
			console.log(`  URL: ${url}`);
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

// config repos - parent command for repo subcommands
const configReposCommand = Command.make('repos', {}, () =>
	Effect.sync(() => {
		console.log('Usage: btca config repos <command>');
		console.log('');
		console.log('Commands:');
		console.log('  list    List all configured repos');
		console.log('  add     Add a new repo');
	})
).pipe(Command.withSubcommands([configReposListCommand, configReposAddCommand]));

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
		console.log('  model   View or set the model and provider');
		console.log('  repos   Manage configured repos');
	}).pipe(Effect.provide(programLayer))
).pipe(Command.withSubcommands([configModelCommand, configReposCommand]));

// === Main Command ===
const mainCommand = Command.make('btca', {}, () =>
	Effect.sync(() => {
		console.log(`btca v${VERSION}. run btca --help for more information.`);
	})
).pipe(
	Command.withSubcommands([askCommand, serveCommand, openCommand, chatCommand, configCommand])
);

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
