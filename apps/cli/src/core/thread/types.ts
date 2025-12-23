/**
 * Thread and Question types
 *
 * A Thread is a conversation consisting of one or more Questions.
 * Each Question can add new resources, and resources accumulate through the thread.
 */

export interface QuestionMetadata {
	filesRead: string[];
	searchesPerformed: string[];
	tokenUsage: { input: number; output: number };
	durationMs: number;
}

export interface Question {
	id: string;
	threadId: string;
	resources: string[]; // resources added BY THIS QUESTION (not inherited)
	provider: string; // snapshot at ask time
	model: string; // snapshot at ask time
	prompt: string; // user's question
	answer: string; // agent's response
	metadata: QuestionMetadata;
	createdAt: Date;
	order: number; // position in thread (0-indexed)
}

export interface Thread {
	id: string;
	createdAt: Date;
	updatedAt: Date;
	questions: Question[];
}

export interface ThreadSummary {
	id: string;
	createdAt: Date;
	updatedAt: Date;
	questionCount: number;
	resources: string[]; // all resources accumulated across questions
	firstPrompt?: string; // first question's prompt (for display)
}

/**
 * Compute all resources for a thread up to and including new resources.
 * Resources accumulate through the thread.
 */
export const getAccumulatedResources = (thread: Thread, newResources: string[]): string[] => {
	const previous = thread.questions.flatMap((q) => q.resources);
	const all = [...new Set([...previous, ...newResources])];
	return all.sort();
};

/**
 * Get all resources accumulated in a thread (from all questions)
 */
export const getThreadResources = (thread: Thread): string[] => {
	const all = thread.questions.flatMap((q) => q.resources);
	return [...new Set(all)].sort();
};

/**
 * Create a new empty question (to be filled in after agent responds)
 */
export const createQuestion = (args: {
	threadId: string;
	resources: string[];
	provider: string;
	model: string;
	prompt: string;
	order: number;
}): Omit<Question, 'id' | 'answer' | 'metadata' | 'createdAt'> => ({
	threadId: args.threadId,
	resources: args.resources,
	provider: args.provider,
	model: args.model,
	prompt: args.prompt,
	order: args.order
});

/**
 * Generate a unique ID for threads and questions
 */
export const generateId = (): string => {
	return crypto.randomUUID();
};
