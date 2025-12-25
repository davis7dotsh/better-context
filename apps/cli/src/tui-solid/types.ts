import type { BtcaChunk } from '../core/index.ts';

export interface Repo {
	name: string;
	url: string;
	branch: string;
	specialNotes?: string | undefined;
	searchPath?: string | undefined;
}

export type InputState = (
	| {
			type: 'text' | 'command' | 'mention';
			content: string;
	  }
	| {
			type: 'pasted';
			content: string;
			lines: number;
	  }
)[];

export type AssistantContent =
	| { type: 'text'; content: string }
	| { type: 'chunks'; chunks: BtcaChunk[] };

export type Message =
	| {
			role: 'user';
			content: InputState;
	  }
	| {
			role: 'assistant';
			content: AssistantContent;
	  }
	| {
			role: 'system';
			content: string;
	  };

export type Mode =
	| 'chat'
	| 'add-repo'
	| 'remove-repo'
	| 'config-model'
	| 'select-blessed-model'
	| 'loading';

export type CommandMode =
	| 'add-repo'
	| 'remove-repo'
	| 'config-model'
	| 'select-blessed-model'
	| 'chat'
	| 'ask'
	| 'clear';

export interface Command {
	name: string;
	description: string;
	mode: CommandMode;
}
