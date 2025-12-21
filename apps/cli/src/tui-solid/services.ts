import { BunContext } from '@effect/platform-bun';
import { Effect, Layer, ManagedRuntime, Stream } from 'effect';
import { ConfigService } from '../services/config.ts';
import { OcService, type OcEvent, type SessionState } from '../services/oc.ts';
import { WorkspaceService } from '../services/workspace.ts';
import type { Repo } from './types.ts';

const ServicesLayer = Layer.mergeAll(
	OcService.Default,
	ConfigService.Default,
	WorkspaceService.Default
).pipe(Layer.provideMerge(BunContext.layer));

const runtime = ManagedRuntime.make(ServicesLayer);

export const services = {
	getRepos: (): Promise<Repo[]> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const config = yield* ConfigService;
				const repos = yield* config.getRepos();
				// Convert readonly to mutable
				return repos.map((r) => ({ ...r }));
			})
		),

	addRepo: (repo: Repo): Promise<Repo> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const config = yield* ConfigService;
				const added = yield* config.addRepo(repo);
				return { ...added };
			})
		),

	removeRepo: (name: string): Promise<void> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const config = yield* ConfigService;
				yield* config.removeRepo(name);
			})
		),

	getModel: (): Promise<{ provider: string; model: string }> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const config = yield* ConfigService;
				return yield* config.getModel();
			})
		),

	updateModel: (provider: string, model: string): Promise<{ provider: string; model: string }> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const config = yield* ConfigService;
				return yield* config.updateModel({ provider, model });
			})
		),

	// OC operations - multi-repo support
	spawnTui: (repos: string[]): Promise<void> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const oc = yield* OcService;
				yield* oc.spawnTui({ repos });
			})
		),

	/**
	 * Create a persistent session for chat
	 */
	createSession: (repos: string[]): Promise<SessionState> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const oc = yield* OcService;
				return yield* oc.createSession({ repos });
			})
		),

	/**
	 * Ask a question in an existing session (preserves context)
	 */
	askInSession: (
		session: SessionState,
		question: string,
		onEvent: (event: OcEvent) => void
	): Promise<void> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const oc = yield* OcService;
				const stream = yield* oc.askInSession({ session, question });
				yield* Stream.runForEach(stream, (event) => Effect.sync(() => onEvent(event)));
			})
		),

	/**
	 * End a session and cleanup
	 */
	endSession: (session: SessionState): Promise<void> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const oc = yield* OcService;
				yield* oc.endSession(session);
			})
		),

	/**
	 * Single-shot question across multiple repos (creates and destroys session)
	 */
	askQuestion: (
		repos: string[],
		question: string,
		onEvent: (event: OcEvent) => void
	): Promise<void> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const oc = yield* OcService;
				const stream = yield* oc.askQuestion({
					repos,
					question,
					suppressLogs: true
				});

				yield* Stream.runForEach(stream, (event) => Effect.sync(() => onEvent(event)));
			})
		),

	/**
	 * Legacy: single-tech question for backwards compatibility
	 */
	askQuestionLegacy: (
		tech: string,
		question: string,
		onEvent: (event: OcEvent) => void
	): Promise<void> =>
		runtime.runPromise(
			Effect.gen(function* () {
				const oc = yield* OcService;
				const stream = yield* oc.askQuestionLegacy({
					question,
					tech,
					suppressLogs: true
				});

				yield* Stream.runForEach(stream, (event) => Effect.sync(() => onEvent(event)));
			})
		)
};

export type Services = typeof services;
