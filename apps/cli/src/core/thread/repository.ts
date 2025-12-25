import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import { eq, desc } from 'drizzle-orm';
import { createDb, schema } from '../../db/index.ts';
import type { Thread, Question, ThreadSummary } from './types.ts';
import { generateId } from './types.ts';

export class ThreadRepositoryError extends TaggedError('ThreadRepositoryError')<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

export interface ThreadRepository {
	createThread: () => Effect.Effect<Thread, ThreadRepositoryError>;
	getThread: (id: string) => Effect.Effect<Thread | null, ThreadRepositoryError>;
	listThreads: () => Effect.Effect<ThreadSummary[], ThreadRepositoryError>;
	deleteThread: (id: string) => Effect.Effect<void, ThreadRepositoryError>;
	appendQuestion: (
		threadId: string,
		question: Omit<Question, 'id' | 'createdAt'>
	) => Effect.Effect<Question, ThreadRepositoryError>;
	updateQuestion: (
		questionId: string,
		updates: Partial<Pick<Question, 'answer' | 'metadata'>>
	) => Effect.Effect<void, ThreadRepositoryError>;
}

/**
 * Create a thread repository backed by SQLite with Drizzle ORM
 */
export const createThreadRepository = (
	dbPath: string
): Effect.Effect<ThreadRepository, ThreadRepositoryError> =>
	Effect.try({
		try: () => {
			const db = createDb(dbPath);

			const repository: ThreadRepository = {
				createThread: () =>
					Effect.try({
						try: () => {
							const id = generateId();
							const now = new Date();

							db.insert(schema.threads)
								.values({
									id,
									createdAt: now,
									updatedAt: now
								})
								.run();

							return {
								id,
								createdAt: now,
								updatedAt: now,
								questions: []
							};
						},
						catch: (e) =>
							new ThreadRepositoryError({ message: 'Failed to create thread', cause: e })
					}),

				getThread: (id: string) =>
					Effect.try({
						try: () => {
							const thread = db
								.select()
								.from(schema.threads)
								.where(eq(schema.threads.id, id))
								.get();

							if (!thread) return null;

							const rows = db
								.select()
								.from(schema.questions)
								.where(eq(schema.questions.threadId, id))
								.orderBy(schema.questions.order)
								.all();

							return {
								id: thread.id,
								createdAt: thread.createdAt,
								updatedAt: thread.updatedAt,
								questions: rows.map((q) => ({
									id: q.id,
									threadId: q.threadId,
									resources: q.resources,
									provider: q.provider,
									model: q.model,
									prompt: q.prompt,
									answer: q.answer,
									metadata: q.metadata,
									createdAt: q.createdAt,
									order: q.order
								}))
							};
						},
						catch: (e) => new ThreadRepositoryError({ message: 'Failed to get thread', cause: e })
					}),

				listThreads: () =>
					Effect.try({
						try: () => {
							const threadRows = db
								.select()
								.from(schema.threads)
								.orderBy(desc(schema.threads.updatedAt))
								.all();

							return threadRows.map((row): ThreadSummary => {
								const questionRows = db
									.select()
									.from(schema.questions)
									.where(eq(schema.questions.threadId, row.id))
									.orderBy(schema.questions.order)
									.all();

								const resources = [...new Set(questionRows.flatMap((q) => q.resources))].sort();

								return {
									id: row.id,
									createdAt: row.createdAt,
									updatedAt: row.updatedAt,
									questionCount: questionRows.length,
									resources,
									firstPrompt: questionRows[0]?.prompt
								};
							});
						},
						catch: (e) => new ThreadRepositoryError({ message: 'Failed to list threads', cause: e })
					}),

				deleteThread: (id: string) =>
					Effect.try({
						try: () => {
							db.delete(schema.threads).where(eq(schema.threads.id, id)).run();
						},
						catch: (e) =>
							new ThreadRepositoryError({ message: 'Failed to delete thread', cause: e })
					}),

				appendQuestion: (threadId: string, question: Omit<Question, 'id' | 'createdAt'>) =>
					Effect.try({
						try: () => {
							const id = generateId();
							const now = new Date();

							db.insert(schema.questions)
								.values({
									id,
									threadId,
									resources: question.resources,
									provider: question.provider,
									model: question.model,
									prompt: question.prompt,
									answer: question.answer,
									metadata: question.metadata,
									createdAt: now,
									order: question.order
								})
								.run();

							// Update thread's updated_at
							db.update(schema.threads)
								.set({ updatedAt: now })
								.where(eq(schema.threads.id, threadId))
								.run();

							return {
								...question,
								id,
								createdAt: now
							};
						},
						catch: (e) =>
							new ThreadRepositoryError({ message: 'Failed to append question', cause: e })
					}),

				updateQuestion: (
					questionId: string,
					updates: Partial<Pick<Question, 'answer' | 'metadata'>>
				) =>
					Effect.try({
						try: () => {
							if (Object.keys(updates).length === 0) return;

							db.update(schema.questions)
								.set(updates)
								.where(eq(schema.questions.id, questionId))
								.run();

							// Update thread's updated_at
							const question = db
								.select({ threadId: schema.questions.threadId })
								.from(schema.questions)
								.where(eq(schema.questions.id, questionId))
								.get();

							if (question) {
								db.update(schema.threads)
									.set({ updatedAt: new Date() })
									.where(eq(schema.threads.id, question.threadId))
									.run();
							}
						},
						catch: (e) =>
							new ThreadRepositoryError({ message: 'Failed to update question', cause: e })
					})
			};

			return repository;
		},
		catch: (e) => new ThreadRepositoryError({ message: 'Failed to initialize database', cause: e })
	});
