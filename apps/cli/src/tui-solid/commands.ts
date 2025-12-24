import type { Command } from './types.ts';

export const COMMANDS: Command[] = [
	{
		name: 'add',
		description: 'Add a new resource',
		mode: 'add-repo'
	},
	{
		name: 'remove',
		description: 'Remove a repo from config',
		mode: 'remove-repo'
	},
	{
		name: 'model',
		description: 'Select from recommended models',
		mode: 'select-blessed-model'
	},
	{
		name: 'custom',
		description: 'Configure custom model & provider',
		mode: 'config-model'
	},
	{
		name: 'clear',
		description: 'Clear chat history',
		mode: 'clear'
	}
];

export function filterCommands(query: string): Command[] {
	const lowerQuery = query.toLowerCase();
	return COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(lowerQuery));
}
