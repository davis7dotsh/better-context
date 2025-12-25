import type { OpencodeClient, Event as OcEvent } from '@opencode-ai/sdk';

/**
 * Agent types
 *
 * An Agent is an OpenCode instance with its working directory set to a collection.
 */

export interface SessionState {
	client: OpencodeClient;
	server: { close: () => void; url: string };
	sessionID: string;
	collectionPath: string;
	resources: string[];
}

export interface AgentMetadata {
	filesRead: string[];
	searchesPerformed: string[];
	tokenUsage: { input: number; output: number };
	durationMs: number;
}

export type BtcaChunk =
	| { type: 'tool'; id: string; toolName: string; state: 'pending' | 'running' | 'completed' }
	| { type: 'text'; id: string; text: string }
	| { type: 'reasoning'; id: string; text: string }
	| { type: 'file'; id: string; filePath: string };

export { type OcEvent };
