import { Database } from 'bun:sqlite';
import { Effect } from 'effect';
import { TaggedError } from 'effect/Data';
import type { Thread, Question, QuestionMetadata, ThreadSummary } from './types.ts';
import { generateId } from './types.ts';

export class ThreadRepositoryError extends TaggedError('ThreadRepositoryError')<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  resources TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  metadata TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  "order" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_thread ON questions(thread_id);
`;

interface ThreadRow {
	id: string;
	created_at: number;
	updated_at: number;
}

interface QuestionRow {
	id: string;
	thread_id: string;
	resources: string;
	provider: string;
	model: string;
	prompt: string;
	answer: string;
	metadata: string;
	created_at: number;
	order: number;
}

const rowToThread = (row: ThreadRow, questions: Question[]): Thread => ({
	id: row.id,
	createdAt: new Date(row.created_at),
	updatedAt: new Date(row.updated_at),
	questions: questions.sort((a, b) => a.order - b.order)
});

const rowToQuestion = (row: QuestionRow): Question => ({
	id: row.id,
	threadId: row.thread_id,
	resources: JSON.parse(row.resources) as string[],
	provider: row.provider,
	model: row.model,
	prompt: row.prompt,
	answer: row.answer,
	metadata: JSON.parse(row.metadata) as QuestionMetadata,
	createdAt: new Date(row.created_at),
	order: row.order
});

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
 * Create a thread repository backed by SQLite
 */
export const createThreadRepository = (
	dbPath: string
): Effect.Effect<ThreadRepository, ThreadRepositoryError> =>
	Effect.try({
		try: () => {
			const db = new Database(dbPath);
			db.exec(SCHEMA);

			const repository: ThreadRepository = {
				createThread: () =>
					Effect.try({
						try: () => {
							const id = generateId();
							const now = Date.now();

							db.run('INSERT INTO threads (id, created_at, updated_at) VALUES (?, ?, ?)', [
								id,
								now,
								now
							]);

							return {
								id,
								createdAt: new Date(now),
								updatedAt: new Date(now),
								questions: []
							};
						},
						catch: (e) =>
							new ThreadRepositoryError({ message: 'Failed to create thread', cause: e })
					}),

				getThread: (id: string) =>
					Effect.try({
						try: () => {
							const threadRow = db
								.query<ThreadRow, [string]>('SELECT * FROM threads WHERE id = ?')
								.get(id);

							if (!threadRow) {
								return null;
							}

							const questionRows = db
								.query<
									QuestionRow,
									[string]
								>('SELECT * FROM questions WHERE thread_id = ? ORDER BY "order"')
								.all(id);

							const questions = questionRows.map(rowToQuestion);
							return rowToThread(threadRow, questions);
						},
						catch: (e) => new ThreadRepositoryError({ message: 'Failed to get thread', cause: e })
					}),

				listThreads: () =>
					Effect.try({
						try: () => {
							const threadRows = db
								.query<ThreadRow, []>('SELECT * FROM threads ORDER BY updated_at DESC')
								.all();

							return threadRows.map((row): ThreadSummary => {
								const questionRows = db
									.query<
										QuestionRow,
										[string]
									>('SELECT * FROM questions WHERE thread_id = ? ORDER BY "order"')
									.all(row.id);

								const resources = [
									...new Set(questionRows.flatMap((q) => JSON.parse(q.resources) as string[]))
								].sort();

								return {
									id: row.id,
									createdAt: new Date(row.created_at),
									updatedAt: new Date(row.updated_at),
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
							db.run('DELETE FROM threads WHERE id = ?', [id]);
						},
						catch: (e) =>
							new ThreadRepositoryError({ message: 'Failed to delete thread', cause: e })
					}),

				appendQuestion: (threadId: string, question: Omit<Question, 'id' | 'createdAt'>) =>
					Effect.try({
						try: () => {
							const id = generateId();
							const now = Date.now();

							db.run(
								`INSERT INTO questions (id, thread_id, resources, provider, model, prompt, answer, metadata, created_at, "order")
								 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
								[
									id,
									threadId,
									JSON.stringify(question.resources),
									question.provider,
									question.model,
									question.prompt,
									question.answer,
									JSON.stringify(question.metadata),
									now,
									question.order
								]
							);

							// Update thread's updated_at
							db.run('UPDATE threads SET updated_at = ? WHERE id = ?', [now, threadId]);

							return {
								...question,
								id,
								createdAt: new Date(now)
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
							const sets: string[] = [];
							const values: unknown[] = [];

							if (updates.answer !== undefined) {
								sets.push('answer = ?');
								values.push(updates.answer);
							}

							if (updates.metadata !== undefined) {
								sets.push('metadata = ?');
								values.push(JSON.stringify(updates.metadata));
							}

							if (sets.length === 0) {
								return;
							}

							values.push(questionId);
							db.run(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`, values as string[]);

							// Also update thread's updated_at
							const row = db
								.query<
									{ thread_id: string },
									[string]
								>('SELECT thread_id FROM questions WHERE id = ?')
								.get(questionId);

							if (row) {
								db.run('UPDATE threads SET updated_at = ? WHERE id = ?', [
									Date.now(),
									row.thread_id
								]);
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
