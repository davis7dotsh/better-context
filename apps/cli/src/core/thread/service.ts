import { Effect } from 'effect';
import type { Thread, Question, QuestionMetadata, ThreadSummary } from './types.ts';
import { getAccumulatedResources, getThreadResources } from './types.ts';
import type { ThreadRepository } from './repository.ts';
import { ThreadRepositoryError } from './repository.ts';

export interface ThreadServiceConfig {
	repository: ThreadRepository;
}

/**
 * Create the thread service
 */
export const createThreadService = (config: ThreadServiceConfig) => {
	const { repository } = config;

	return {
		/**
		 * Create a new empty thread
		 */
		create: (): Effect.Effect<Thread, ThreadRepositoryError> => repository.createThread(),

		/**
		 * Get a thread by ID (with all questions)
		 */
		get: (threadId: string): Effect.Effect<Thread | null, ThreadRepositoryError> =>
			repository.getThread(threadId),

		/**
		 * List all threads (summaries only)
		 */
		list: (): Effect.Effect<ThreadSummary[], ThreadRepositoryError> => repository.listThreads(),

		/**
		 * Delete a thread
		 */
		delete: (threadId: string): Effect.Effect<void, ThreadRepositoryError> =>
			repository.deleteThread(threadId),

		/**
		 * Append a completed question to a thread
		 */
		appendQuestion: (
			threadId: string,
			question: {
				resources: string[];
				provider: string;
				model: string;
				prompt: string;
				answer: string;
				metadata: QuestionMetadata;
			}
		): Effect.Effect<Question, ThreadRepositoryError> =>
			Effect.gen(function* () {
				// Get current thread to determine order
				const thread = yield* repository.getThread(threadId);
				if (!thread) {
					return yield* Effect.fail(
						new ThreadRepositoryError({ message: `Thread "${threadId}" not found` })
					);
				}

				const order = thread.questions.length;

				return yield* repository.appendQuestion(threadId, {
					...question,
					threadId,
					order
				});
			}),

		/**
		 * Update a question (e.g., after streaming completes)
		 */
		updateQuestion: (
			questionId: string,
			updates: Partial<Pick<Question, 'answer' | 'metadata'>>
		): Effect.Effect<void, ThreadRepositoryError> => repository.updateQuestion(questionId, updates),

		/**
		 * Get accumulated resources for a thread with new additions
		 */
		getAccumulatedResources: (
			threadId: string,
			newResources: string[]
		): Effect.Effect<string[], ThreadRepositoryError> =>
			Effect.gen(function* () {
				const thread = yield* repository.getThread(threadId);
				if (!thread) {
					// New thread, just return new resources sorted
					return [...newResources].sort();
				}
				return getAccumulatedResources(thread, newResources);
			}),

		/**
		 * Get all resources in a thread
		 */
		getThreadResources: (threadId: string): Effect.Effect<string[], ThreadRepositoryError> =>
			Effect.gen(function* () {
				const thread = yield* repository.getThread(threadId);
				if (!thread) {
					return [];
				}
				return getThreadResources(thread);
			}),

		/**
		 * Create a thread and immediately add the first question
		 */
		createWithQuestion: (question: {
			resources: string[];
			provider: string;
			model: string;
			prompt: string;
			answer: string;
			metadata: QuestionMetadata;
		}): Effect.Effect<{ thread: Thread; question: Question }, ThreadRepositoryError> =>
			Effect.gen(function* () {
				const thread = yield* repository.createThread();

				const q = yield* repository.appendQuestion(thread.id, {
					...question,
					threadId: thread.id,
					order: 0
				});

				return {
					thread: { ...thread, questions: [q] },
					question: q
				};
			})
	};
};

export type ThreadService = ReturnType<typeof createThreadService>;
