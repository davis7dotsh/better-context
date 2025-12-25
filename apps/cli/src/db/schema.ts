import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import type { QuestionMetadata } from '../core/thread/types.ts';

export const threads = sqliteTable('threads', {
	id: text('id').primaryKey(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const questions = sqliteTable(
	'questions',
	{
		id: text('id').primaryKey(),
		threadId: text('thread_id')
			.notNull()
			.references(() => threads.id, { onDelete: 'cascade' }),
		resources: text('resources', { mode: 'json' }).notNull().$type<string[]>(),
		provider: text('provider').notNull(),
		model: text('model').notNull(),
		prompt: text('prompt').notNull(),
		answer: text('answer').notNull(),
		metadata: text('metadata', { mode: 'json' }).notNull().$type<QuestionMetadata>(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
		order: integer('order').notNull()
	},
	(table) => [index('idx_questions_thread').on(table.threadId)]
);
