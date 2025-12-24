import {
	createOpencode,
	createOpencodeClient,
	type Config as OpenCodeConfig,
	type ProviderConfig,
	type OpencodeClient,
	type Event as OcEvent
} from '@opencode-ai/sdk';
import { spawn } from 'bun';
import { Deferred, Effect, Stream } from 'effect';
import { TaggedError } from 'effect/Data';
import type { CollectionInfo } from '../collection/types.ts';
import type { ResourceInfo } from '../resource/types.ts';
import type { Thread } from '../thread/types.ts';
import type { SessionState, AgentMetadata, BtcaChunk } from './types.ts';
import { getMultiRepoDocsAgentPrompt, type RepoInfo } from '../../lib/prompts.ts';

export class AgentError extends TaggedError('AgentError')<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export class InvalidProviderError extends TaggedError('InvalidProviderError')<{
	readonly providerId: string;
	readonly availableProviders: string[];
}> {}

export class InvalidModelError extends TaggedError('InvalidModelError')<{
	readonly providerId: string;
	readonly modelId: string;
	readonly availableModels: string[];
}> {}

export class ProviderNotConnectedError extends TaggedError('ProviderNotConnectedError')<{
	readonly providerId: string;
	readonly connectedProviders: string[];
}> {}

// Preset models configuration
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
	},
	openrouter: {
		models: {
			'btca-glm-4-6': {
				id: 'z-ai/glm-4.6',
				options: {
					provider: {
						only: ['cerebras']
					}
				}
			}
		}
	}
};

/**
 * Build OpenCode config for a collection
 */
export const buildOpenCodeConfig = (args: { resources: ResourceInfo[] }): OpenCodeConfig => {
	const repos: RepoInfo[] = args.resources.map((r) => ({
		name: r.name,
		relativePath: r.name,
		specialNotes: r.specialNotes
	}));

	const prompt = getMultiRepoDocsAgentPrompt({ repos });

	return {
		provider: BTCA_PRESET_MODELS,
		agent: {
			build: { disable: true },
			explore: { disable: true },
			general: { disable: true },
			plan: { disable: true },
			docs: {
				prompt,
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
};

/**
 * Build context prompt from thread history
 */
export const buildThreadContextPrompt = (thread: Thread): string => {
	if (thread.questions.length === 0) return '';

	const history = thread.questions
		.map((q, i) => {
			const accumulatedResources = [
				...new Set(thread.questions.slice(0, i + 1).flatMap((x) => x.resources))
			].sort();

			return [
				`--- Previous Question ${i + 1} ---`,
				`Resources in context: ${accumulatedResources.join(', ') || 'none'}`,
				'',
				`User: ${q.prompt}`,
				'',
				`Assistant: ${q.answer}`,
				''
			].join('\n');
		})
		.join('\n');

	return [
		'=== THREAD HISTORY ===',
		'The following is the history of this conversation thread.',
		'Use this context to provide consistent and informed answers.',
		'',
		history,
		'=== END THREAD HISTORY ==='
	].join('\n');
};

/**
 * Validate provider and model configuration
 */
export const validateProviderAndModel = (
	client: OpencodeClient,
	providerId: string,
	modelId: string
) =>
	Effect.gen(function* () {
		const response = yield* Effect.tryPromise(() => client.provider.list()).pipe(Effect.option);

		// If we couldn't fetch providers, skip validation (fail open)
		if (response._tag === 'None' || !response.value.data) {
			return;
		}

		const { all, connected } = response.value.data;

		// Check if provider exists
		const provider = all.find((p) => p.id === providerId);
		if (!provider) {
			return yield* Effect.fail(
				new InvalidProviderError({
					providerId,
					availableProviders: all.map((p) => p.id)
				})
			);
		}

		// Check if provider is connected (has valid auth)
		if (!connected.includes(providerId)) {
			return yield* Effect.fail(
				new ProviderNotConnectedError({
					providerId,
					connectedProviders: connected
				})
			);
		}

		// Check if model exists for this provider
		const modelIds = Object.keys(provider.models);
		if (!modelIds.includes(modelId)) {
			return yield* Effect.fail(
				new InvalidModelError({
					providerId,
					modelId,
					availableModels: modelIds
				})
			);
		}
	});

/**
 * Extract metadata from OpenCode events
 */
export const extractMetadataFromEvents = (events: OcEvent[]): AgentMetadata => {
	const filesRead: string[] = [];
	const searchesPerformed: string[] = [];
	let inputTokens = 0;
	let outputTokens = 0;

	for (const event of events) {
		const eventType = event.type as string;
		if (eventType === 'tool.result') {
			const props = event.properties as {
				name?: string;
				input?: { filePath?: string; pattern?: string; path?: string };
			};
			if (props.name === 'read' && props.input?.filePath) {
				filesRead.push(props.input.filePath);
			} else if (props.name === 'grep' && props.input?.pattern) {
				searchesPerformed.push(`grep: ${props.input.pattern}`);
			} else if (props.name === 'glob' && props.input?.pattern) {
				searchesPerformed.push(`glob: ${props.input.pattern}`);
			}
		} else if (event.type === 'message.updated') {
			const props = event.properties as {
				message?: { metadata?: { usage?: { input?: number; output?: number } } };
			};
			if (props.message?.metadata?.usage) {
				inputTokens += props.message.metadata.usage.input ?? 0;
				outputTokens += props.message.metadata.usage.output ?? 0;
			}
		}
	}

	return {
		filesRead: [...new Set(filesRead)],
		searchesPerformed: [...new Set(searchesPerformed)],
		tokenUsage: { input: inputTokens, output: outputTokens },
		durationMs: 0 // Will be set by caller
	};
};

export type ChunkUpdate =
	| { type: 'add'; chunk: BtcaChunk }
	| { type: 'update'; id: string; chunk: Partial<BtcaChunk> };

export const streamToChunks = (eventStream: Stream.Stream<OcEvent, AgentError>) => {
	const chunks = new Map<string, BtcaChunk>();
	const allEvents: OcEvent[] = [];

	const chunkStream = eventStream.pipe(
		Stream.mapConcat((event): ChunkUpdate[] => {
			allEvents.push(event);

			if (event.type !== 'message.part.updated') return [];

			const part = event.properties.part;
			const partId = part.id;

			switch (part.type) {
				case 'text': {
					const existing = chunks.get(partId);
					if (existing && existing.type === 'text') {
						existing.text = part.text;
						return [{ type: 'update', id: partId, chunk: { text: part.text } }];
					}
					const chunk: BtcaChunk = { type: 'text', id: partId, text: part.text };
					chunks.set(partId, chunk);
					return [{ type: 'add', chunk }];
				}
				case 'reasoning': {
					const existing = chunks.get(partId);
					if (existing && existing.type === 'reasoning') {
						existing.text = part.text;
						return [{ type: 'update', id: partId, chunk: { text: part.text } }];
					}
					const chunk: BtcaChunk = { type: 'reasoning', id: partId, text: part.text };
					chunks.set(partId, chunk);
					return [{ type: 'add', chunk }];
				}
				case 'tool': {
					const existing = chunks.get(partId);
					const status = part.state.status;
					const state =
						status === 'pending' ? 'pending' : status === 'running' ? 'running' : 'completed';
					if (existing && existing.type === 'tool') {
						existing.state = state;
						return [{ type: 'update', id: partId, chunk: { state } }];
					}
					const chunk: BtcaChunk = { type: 'tool', id: partId, toolName: part.tool, state };
					chunks.set(partId, chunk);
					return [{ type: 'add', chunk }];
				}
				case 'file': {
					if (chunks.has(partId)) return [];
					const chunk: BtcaChunk = {
						type: 'file',
						id: partId,
						filePath: part.filename ?? part.url
					};
					chunks.set(partId, chunk);
					return [{ type: 'add', chunk }];
				}
				default:
					return [];
			}
		})
	);

	return {
		stream: chunkStream,
		getChunks: () => [...chunks.values()],
		getEvents: () => allEvents
	};
};

/**
 * Spawn the OpenCode TUI
 */
const spawnOpencodeTui = async (args: {
	config: OpenCodeConfig;
	collectionPath: string;
	provider: string;
	model: string;
}) => {
	const proc = spawn(['opencode', `--model=${args.provider}/${args.model}`], {
		stdin: 'inherit',
		stdout: 'inherit',
		stderr: 'inherit',
		cwd: args.collectionPath,
		env: {
			...process.env,
			OPENCODE_CONFIG_CONTENT: JSON.stringify(args.config)
		}
	});

	await proc.exited;
};

export interface AgentServiceConfig {
	provider: string;
	model: string;
}

/**
 * Create the agent service
 */
export const createAgentService = (config: AgentServiceConfig) => {
	const { provider, model } = config;

	/**
	 * Create an OpenCode instance for a collection
	 */
	const getOpencodeInstance = (args: { collectionPath: string; ocConfig: OpenCodeConfig }) =>
		Effect.gen(function* () {
			const maxAttempts = 10;
			const { collectionPath, ocConfig } = args;

			for (let attempt = 0; attempt < maxAttempts; attempt++) {
				const port = Math.floor(Math.random() * 3000) + 3000;
				const result = yield* Effect.tryPromise(() =>
					createOpencode({
						port,
						config: ocConfig
					})
				).pipe(
					Effect.catchAll((err) => {
						if (err.cause instanceof Error && err.cause.stack?.includes('port')) {
							return Effect.succeed(null);
						}
						return Effect.fail(
							new AgentError({
								message: 'Failed to create OpenCode instance',
								cause: err
							})
						);
					})
				);
				if (result !== null) {
					const client = createOpencodeClient({
						baseUrl: `http://localhost:${port}`,
						directory: collectionPath
					});
					return {
						client,
						server: result.server
					};
				}
			}
			return yield* Effect.fail(
				new AgentError({
					message: 'Failed to create OpenCode instance - all port attempts exhausted',
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
					new AgentError({
						message: 'Failed to subscribe to events',
						cause: err
					})
			});

			return Stream.fromAsyncIterable(
				events.stream,
				(e) => new AgentError({ message: 'Event stream error', cause: e })
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
		errorDeferred: Deferred.Deferred<never, AgentError>;
		client: OpencodeClient;
	}) =>
		Effect.promise(() =>
			args.client.session.prompt({
				path: { id: args.sessionID },
				body: {
					agent: 'docs',
					model: {
						providerID: provider,
						modelID: model
					},
					parts: [{ type: 'text', text: args.text }]
				}
			})
		).pipe(
			Effect.catchAll((err) =>
				Deferred.fail(args.errorDeferred, new AgentError({ message: String(err), cause: err }))
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

			const errorDeferred = yield* Deferred.make<never, AgentError>();

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
								new AgentError({
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
		 * Spawn the OpenCode TUI for a collection
		 */
		spawnTui: (args: { collection: CollectionInfo; resources: ResourceInfo[] }) =>
			Effect.gen(function* () {
				const { collection, resources } = args;

				const ocConfig = buildOpenCodeConfig({ resources });

				yield* Effect.tryPromise({
					try: () =>
						spawnOpencodeTui({
							config: ocConfig,
							collectionPath: collection.path,
							provider,
							model
						}),
					catch: (err) => new AgentError({ message: 'TUI exited with error', cause: err })
				});
			}),

		/**
		 * Create a persistent session for follow-up questions
		 */
		createSession: (args: { collection: CollectionInfo; resources: ResourceInfo[] }) =>
			Effect.gen(function* () {
				const { collection, resources } = args;

				const ocConfig = buildOpenCodeConfig({ resources });

				const { client, server } = yield* getOpencodeInstance({
					collectionPath: collection.path,
					ocConfig
				});

				yield* validateProviderAndModel(client, provider, model);

				const session = yield* Effect.promise(() => client.session.create());

				if (session.error) {
					server.close();
					return yield* Effect.fail(
						new AgentError({
							message: 'Failed to create session',
							cause: session.error
						})
					);
				}

				const sessionState: SessionState = {
					client,
					server,
					sessionID: session.data.id,
					collectionPath: collection.path,
					resources: resources.map((r) => r.name).sort()
				};

				return sessionState;
			}),

		/**
		 * Ask a question in an existing session (preserves context)
		 */
		askInSession: (args: { session: SessionState; question: string; threadContext?: string }) =>
			Effect.gen(function* () {
				const { session, question, threadContext } = args;

				const fullPrompt = threadContext ? `${threadContext}\n\n${question}` : question;

				return yield* streamPrompt({
					sessionID: session.sessionID,
					prompt: fullPrompt,
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
		 * Ask a single question (creates and destroys session)
		 */
		ask: (args: {
			collection: CollectionInfo;
			resources: ResourceInfo[];
			question: string;
			threadContext?: string;
		}) =>
			Effect.gen(function* () {
				const { collection, resources, question, threadContext } = args;

				const ocConfig = buildOpenCodeConfig({ resources });

				const { client, server } = yield* getOpencodeInstance({
					collectionPath: collection.path,
					ocConfig
				});

				yield* validateProviderAndModel(client, provider, model);

				const session = yield* Effect.promise(() => client.session.create());

				if (session.error) {
					server.close();
					return yield* Effect.fail(
						new AgentError({
							message: 'Failed to create session',
							cause: session.error
						})
					);
				}

				const fullPrompt = threadContext ? `${threadContext}\n\n${question}` : question;

				return yield* streamPrompt({
					sessionID: session.data.id,
					prompt: fullPrompt,
					client,
					cleanup: () => {
						server.close();
					}
				});
			})
	};
};

export type AgentService = ReturnType<typeof createAgentService>;
