import { createSignal, createMemo, For, Show, type Component } from 'solid-js';
import { colors } from '../theme.ts';
import { useKeyboard } from '@opentui/solid';
import { useAppContext } from '../context/app-context.tsx';
import { COMMANDS, filterCommands } from '../commands.ts';
import type { Command } from '../types.ts';

export const CommandPalette: Component = () => {
	const appState = useAppContext();

	const input = () => appState.inputState()[0]?.content;

	const filteredCommands = createMemo(() => {
		const curInput = input();
		if (!curInput) return COMMANDS;
		const trimmedInput = curInput.toLowerCase().trim().slice(1);
		return filterCommands(trimmedInput);
	});

	const [selectedIndex, setSelectedIndex] = createSignal(0);

	const executeCommand = (command: Command) => {
		appState.setInputState([]);

		if (command.mode === 'add-repo') {
			appState.setMode('add-repo');
			appState.setWizardStep('name');
			appState.setWizardValues({ name: '', url: '', branch: '', notes: '' });
			appState.setWizardInput('');
		} else if (command.mode === 'clear') {
			appState.clearMessages();
			appState.addMessage({ role: 'system', content: 'Chat cleared.' });
		} else if (command.mode === 'remove-repo') {
			if (appState.repos().length === 0) {
				appState.addMessage({ role: 'system', content: 'No repos to remove' });
				return;
			}
			appState.setRemoveRepoName('');
			appState.setMode('remove-repo');
		} else if (command.mode === 'config-model') {
			appState.setModelStep('provider');
			appState.setModelValues({
				provider: appState.selectedProvider(),
				model: appState.selectedModel()
			});
			appState.setMode('config-model');
		} else if (command.mode === 'select-blessed-model') {
			appState.setMode('select-blessed-model');
		} else if (command.mode === 'chat') {
			appState.addMessage({
				role: 'system',
				content: 'Use @reponame to start a chat. Example: @daytona How do I...?'
			});
		} else if (command.mode === 'ask') {
			appState.addMessage({
				role: 'system',
				content: 'Use @reponame to ask a question. Example: @daytona What is...?'
			});
		}
	};

	useKeyboard((key) => {
		switch (key.name) {
			case 'up':
				if (selectedIndex() > 0) {
					setSelectedIndex(selectedIndex() - 1);
				} else {
					setSelectedIndex(filteredCommands().length - 1);
				}
				break;
			case 'down':
				if (selectedIndex() < filteredCommands().length - 1) {
					setSelectedIndex(selectedIndex() + 1);
				} else {
					setSelectedIndex(0);
				}
				break;
			case 'tab': {
				const curSelectedCommand = filteredCommands()[selectedIndex()];
				if (curSelectedCommand) {
					appState.setInputState([{ content: '/' + curSelectedCommand.name, type: 'command' }]);
					const inputRef = appState.inputRef();
					if (inputRef) {
						inputRef.cursorPosition = curSelectedCommand.name.length + 2;
					}
				}
				break;
			}
			case 'return': {
				const selectedCommand = filteredCommands()[selectedIndex()];
				if (selectedCommand) {
					executeCommand(selectedCommand);
				}
				break;
			}
			case 'escape':
				appState.setInputState([]);
				break;
			default:
				break;
		}
	});

	return (
		<Show
			when={filteredCommands().length > 0}
			fallback={
				<box
					style={{
						position: 'absolute',
						bottom: 4,
						left: 0,
						width: '100%',
						zIndex: 100,
						backgroundColor: colors.bgSubtle,
						border: true,
						borderColor: colors.border,
						padding: 1
					}}
				>
					<text fg={colors.textSubtle} content="No matching commands" />
				</box>
			}
		>
			<box
				style={{
					position: 'absolute',
					bottom: 4,
					left: 0,
					width: '100%',
					zIndex: 100,
					backgroundColor: colors.bgSubtle,
					border: true,
					borderColor: colors.accent,
					flexDirection: 'column',
					padding: 1
				}}
			>
				<text fg={colors.textMuted} content=" Commands" />
				<text content="" style={{ height: 1 }} />
				<For each={filteredCommands()}>
					{(cmd, i) => {
						const isSelected = () => i() === selectedIndex();
						return (
							<box style={{ flexDirection: 'row' }}>
								<text
									fg={isSelected() ? colors.accent : colors.text}
									content={isSelected() ? `▸ /${cmd.name}` : `  /${cmd.name}`}
									style={{ width: 12 }}
								/>
								<text fg={colors.textSubtle} content={` ${cmd.description}`} />
							</box>
						);
					}}
				</For>
			</box>
		</Show>
	);
};
