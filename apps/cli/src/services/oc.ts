import {
	createOpencode,
	OpencodeClient,
	type Event,
	type Config as OpenCodeConfig
} from '@opencode-ai/sdk';
import { spawn } from 'bun';
import { Deferred, Duration, Effect, Stream } from 'effect';
import { ConfigService } from './config.ts';
import { OcError } from '../lib/errors.ts';
import { validateProviderAndModel } from '../lib/utils/validation.ts';

const spawnOpencodeTui = async (args: {
	config: OpenCodeConfig;
	repoDir: string;
	rawConfig: { provider: string; model: string };
}) => {
	const proc = spawn(['opencode', `--model=${args.rawConfig.provider}/${args.rawConfig.model}`], {
		stdin: 'inherit',
		stdout: 'inherit',
		stderr: 'inherit',
		cwd: args.repoDir,
		env: {
			...process.env,
			OPENCODE_CONFIG_CONTENT: JSON.stringify(args.config)
		}
	});

	await proc.exited;
};

export type { Event as OcEvent };

const ocService = Effect.gen(function* () {
	const config = yield* ConfigService;

	const rawConfig = yield* config.rawConfig();

	const getOpencodeInstance = ({ tech }: { tech: string }) =>
		Effect.gen(function* () {
			let portOffset = 0;
			const maxInstances = 30;
			const { ocConfig, repoDir } = yield* config.getOpenCodeConfig({ repoName: tech });

			yield* Effect.sync(() => process.chdir(repoDir));

			while (portOffset < maxInstances) {
				const result = yield* Effect.tryPromise(() =>
					createOpencode({
						port: 3420 + portOffset,
						config: ocConfig
					})
				).pipe(
					Effect.catchAll((err) => {
						if (err.cause instanceof Error && err.cause.stack?.includes('port')) {
							portOffset++;
							return Effect.succeed(null);
						}
						return Effect.fail(
							new OcError({
								message: 'FAILED TO CREATE OPENCODE CLIENT',
								cause: err
							})
						);
					})
				);
				if (result !== null) {
					return result;
				}
			}
			return yield* Effect.fail(
				new OcError({
					message: 'FAILED TO CREATE OPENCODE CLIENT - all ports exhausted',
					cause: null
				})
			);
		});

	const streamSessionEvents = (args: { sessionID: string; client: OpencodeClient }) =>
		Effect.gen(function* () {
			const { sessionID, client } = args;

			const events = yield* Effect.tryPromise({
				try: () => client.event.subscribe(),
				catch: (err) =>
					new OcError({
						message: 'Failed to subscribe to events',
						cause: err
					})
			});

			return Stream.fromAsyncIterable(
				events.stream,
				(e) => new OcError({ message: 'Event stream error', cause: e })
			).pipe(
				Stream.filter((event) => {
					const props = event.properties;
					if (!('sessionID' in props)) return true;
					return props.sessionID === sessionID;
				}),
				Stream.takeUntil(
					(event) => event.type === 'session.idle' && event.properties.sessionID === sessionID
				)
			);
		});

	const firePrompt = (args: {
		sessionID: string;
		text: string;
		errorDeferred: Deferred.Deferred<never, OcError>;
		client: OpencodeClient;
	}) =>
		Effect.promise(() =>
			args.client.session.prompt({
				path: { id: args.sessionID },
				body: {
					agent: 'docs',
					model: {
						providerID: rawConfig.provider,
						modelID: rawConfig.model
					},
					parts: [{ type: 'text', text: args.text }]
				}
			})
		).pipe(
			Effect.catchAll((err) =>
				Deferred.fail(args.errorDeferred, new OcError({ message: String(err), cause: err }))
			)
		);

	const streamPrompt = (args: {
		sessionID: string;
		prompt: string;
		client: OpencodeClient;
		cleanup: () => void;
	}) =>
		Effect.gen(function* () {
			const { sessionID, prompt, client } = args;

			const eventStream = yield* streamSessionEvents({ sessionID, client });

			const errorDeferred = yield* Deferred.make<never, OcError>();

			yield* firePrompt({
				sessionID,
				text: prompt,
				errorDeferred,
				client
			}).pipe(Effect.forkDaemon);

			// Transform stream to fail on session.error, race with prompt error
			return eventStream.pipe(
				Stream.mapEffect((event) =>
					Effect.gen(function* () {
						if (event.type === 'session.error') {
							const props = event.properties as { error?: { name?: string } };
							return yield* Effect.fail(
								new OcError({
									message: props.error?.name ?? 'Unknown session error',
									cause: props.error
								})
							);
						}
						return event;
					})
				),
				Stream.ensuring(Effect.sync(() => args.cleanup())),
				Stream.interruptWhen(Deferred.await(errorDeferred))
			);
		});

	return {
		spawnTui: (args: { tech: string }) =>
			Effect.gen(function* () {
				const { tech } = args;

				yield* config.cloneOrUpdateOneRepoLocally(tech, { suppressLogs: false });

				const { ocConfig, repoDir } = yield* config.getOpenCodeConfig({
					repoName: tech
				});

				yield* Effect.tryPromise({
					try: () => spawnOpencodeTui({ config: ocConfig, repoDir, rawConfig }),
					catch: (err) => new OcError({ message: 'TUI exited with error', cause: err })
				});
			}),
		holdOpenInstanceInBg: () =>
			Effect.gen(function* () {
				const { client, server } = yield* getOpencodeInstance({
					tech: 'svelte'
				});

				yield* Effect.log(`OPENCODE SERVER IS UP AT ${server.url}`);

				yield* Effect.sleep(Duration.days(1));
			}),
		askQuestion: (args: { question: string; tech: string; suppressLogs: boolean }) =>
			Effect.gen(function* () {
				const { question, tech, suppressLogs } = args;

				yield* config.cloneOrUpdateOneRepoLocally(tech, { suppressLogs });

				const { client, server } = yield* getOpencodeInstance({ tech });

				yield* validateProviderAndModel(client, rawConfig.provider, rawConfig.model);

				const session = yield* Effect.promise(() => client.session.create());

				if (session.error) {
					return yield* Effect.fail(
						new OcError({
							message: 'FAILED TO START OPENCODE SESSION',
							cause: session.error
						})
					);
				}

				const sessionID = session.data.id;

				return yield* streamPrompt({
					sessionID,
					prompt: question,
					client,
					cleanup: () => {
						server.close();
					}
				});
			})
	};
});

export class OcService extends Effect.Service<OcService>()('OcService', {
	effect: ocService,
	dependencies: [ConfigService.Default]
}) {}
