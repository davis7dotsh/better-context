import {
	createOpencode,
	createOpencodeClient,
	OpencodeClient,
	type Event,
	type Config as OpenCodeConfig
} from '@opencode-ai/sdk';
import { spawn } from 'bun';
import { Deferred, Duration, Effect, Stream } from 'effect';
import { ConfigService } from './config.ts';
import { WorkspaceService, type WorkspaceInfo } from './workspace.ts';
import { OcError } from '../lib/errors.ts';
import { validateProviderAndModel } from '../lib/utils/validation.ts';

const spawnOpencodeTui = async (args: {
	config: OpenCodeConfig;
	workspacePath: string;
	rawConfig: { provider: string; model: string };
}) => {
	const proc = spawn(['opencode', `--model=${args.rawConfig.provider}/${args.rawConfig.model}`], {
		stdin: 'inherit',
		stdout: 'inherit',
		stderr: 'inherit',
		cwd: args.workspacePath,
		env: {
			...process.env,
			OPENCODE_CONFIG_CONTENT: JSON.stringify(args.config)
		}
	});

	await proc.exited;
};

export type { Event as OcEvent };

/**
 * Represents an active session with an OpenCode instance
 */
export interface SessionState {
	client: OpencodeClient;
	server: { close: () => void; url: string };
	sessionID: string;
	workspacePath: string;
	repos: string[];
}

const ocService = Effect.gen(function* () {
	const config = yield* ConfigService;
	const workspace = yield* WorkspaceService;

	const rawConfig = yield* config.rawConfig();

	/**
	 * Create an OpenCode instance for a workspace
	 */
	const getOpencodeInstanceForWorkspace = (args: {
		workspaceInfo: WorkspaceInfo;
		ocConfig: OpenCodeConfig;
	}) =>
		Effect.gen(function* () {
			let portOffset = 0;
			const maxInstances = 30;
			const { workspaceInfo, ocConfig } = args;

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
					const client = createOpencodeClient({
						baseUrl: `http://localhost:${3420 + portOffset}`,
						directory: workspaceInfo.workspacePath
					});
					return {
						client,
						server: result.server
					};
				}
			}
			return yield* Effect.fail(
				new OcError({
					message: 'FAILED TO CREATE OPENCODE CLIENT - all ports exhausted',
					cause: null
				})
			);
		});

	/**
	 * Legacy: get instance for a single tech (for backwards compat)
	 */
	const getOpencodeInstance = ({ tech }: { tech: string }) =>
		Effect.gen(function* () {
			const workspaceInfo = yield* workspace.ensureWorkspace([tech]);
			const ocConfig = yield* config.getWorkspaceOpenCodeConfig({ repos: workspaceInfo.repos });
			return yield* getOpencodeInstanceForWorkspace({ workspaceInfo, ocConfig });
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
		cleanup?: () => void;
	}) =>
		Effect.gen(function* () {
			const { sessionID, prompt, client, cleanup } = args;

			const eventStream = yield* streamSessionEvents({ sessionID, client });

			const errorDeferred = yield* Deferred.make<never, OcError>();

			yield* firePrompt({
				sessionID,
				text: prompt,
				errorDeferred,
				client
			}).pipe(Effect.forkDaemon);

			// Transform stream to fail on session.error, race with prompt error
			let stream = eventStream.pipe(
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
				Stream.interruptWhen(Deferred.await(errorDeferred))
			);

			if (cleanup) {
				stream = stream.pipe(Stream.ensuring(Effect.sync(cleanup)));
			}

			return stream;
		});

	return {
		/**
		 * Spawn the OpenCode TUI for multiple repos
		 */
		spawnTui: (args: { repos: string[] }) =>
			Effect.gen(function* () {
				const { repos } = args;

				const workspaceInfo = yield* workspace.ensureWorkspace(repos);
				const ocConfig = yield* config.getWorkspaceOpenCodeConfig({ repos: workspaceInfo.repos });

				yield* Effect.tryPromise({
					try: () =>
						spawnOpencodeTui({
							config: ocConfig,
							workspacePath: workspaceInfo.workspacePath,
							rawConfig
						}),
					catch: (err) => new OcError({ message: 'TUI exited with error', cause: err })
				});
			}),

		/**
		 * Legacy: spawn TUI for a single tech
		 */
		spawnTuiLegacy: (args: { tech: string }) =>
			Effect.gen(function* () {
				const { tech } = args;

				yield* config.cloneOrUpdateOneRepoLocally(tech, { suppressLogs: false });

				const { ocConfig, repoDir } = yield* config.getOpenCodeConfig({
					repoName: tech
				});

				yield* Effect.tryPromise({
					try: () => spawnOpencodeTui({ config: ocConfig, workspacePath: repoDir, rawConfig }),
					catch: (err) => new OcError({ message: 'TUI exited with error', cause: err })
				});
			}),

		holdOpenInstanceInBg: () =>
			Effect.gen(function* () {
				const { server } = yield* getOpencodeInstance({
					tech: 'svelte'
				});

				yield* Effect.log(`OPENCODE SERVER IS UP AT ${server.url}`);

				yield* Effect.sleep(Duration.days(1));
			}),

		/**
		 * Create a persistent session for TUI chat
		 * The session stays alive for follow-up questions
		 */
		createSession: (args: { repos: string[] }) =>
			Effect.gen(function* () {
				const { repos } = args;

				const workspaceInfo = yield* workspace.ensureWorkspace(repos);
				const ocConfig = yield* config.getWorkspaceOpenCodeConfig({ repos: workspaceInfo.repos });

				const { client, server } = yield* getOpencodeInstanceForWorkspace({
					workspaceInfo,
					ocConfig
				});

				yield* validateProviderAndModel(client, rawConfig.provider, rawConfig.model);

				const session = yield* Effect.promise(() => client.session.create());

				if (session.error) {
					server.close();
					return yield* Effect.fail(
						new OcError({
							message: 'FAILED TO START OPENCODE SESSION',
							cause: session.error
						})
					);
				}

				const sessionState: SessionState = {
					client,
					server,
					sessionID: session.data.id,
					workspacePath: workspaceInfo.workspacePath,
					repos: repos.sort()
				};

				return sessionState;
			}),

		/**
		 * Ask a question in an existing session (preserves context)
		 */
		askInSession: (args: { session: SessionState; question: string }) =>
			Effect.gen(function* () {
				const { session, question } = args;

				return yield* streamPrompt({
					sessionID: session.sessionID,
					prompt: question,
					client: session.client
					// No cleanup - session stays alive
				});
			}),

		/**
		 * End a session and cleanup resources
		 */
		endSession: (session: SessionState) =>
			Effect.sync(() => {
				session.server.close();
			}),

		/**
		 * Ask a single question across multiple repos (creates and destroys session)
		 */
		askQuestion: (args: {
			repos: string[];
			question: string;
			suppressLogs: boolean;
			noSync?: boolean;
		}) =>
			Effect.gen(function* () {
				const { repos, question, noSync } = args;

				// TODO: If noSync is true, don't ensure workspace
				const workspaceInfo = yield* workspace.ensureWorkspace(repos);
				const ocConfig = yield* config.getWorkspaceOpenCodeConfig({ repos: workspaceInfo.repos });

				const { client, server } = yield* getOpencodeInstanceForWorkspace({
					workspaceInfo,
					ocConfig
				});

				yield* validateProviderAndModel(client, rawConfig.provider, rawConfig.model);

				const session = yield* Effect.promise(() => client.session.create());

				if (session.error) {
					server.close();
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
			}),

		/**
		 * Legacy: ask question for a single tech
		 */
		askQuestionLegacy: (args: { question: string; tech: string; suppressLogs: boolean }) =>
			Effect.gen(function* () {
				const { question, tech, suppressLogs } = args;

				yield* config.cloneOrUpdateOneRepoLocally(tech, { suppressLogs, noSync: args.noSync });

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
	dependencies: [ConfigService.Default, WorkspaceService.Default]
}) {}
