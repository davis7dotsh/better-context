import { createSignal, type Component } from 'solid-js';
import type { ParentProps } from 'solid-js';
import { AppProvider } from './context/app-context';
import { render, useKeyboard, useRenderer } from '@opentui/solid';
import { MainUi } from '.';
import { ConsolePosition } from '@opentui/core';
import { useAppContext } from './context/app-context.tsx';
import { services } from './services.ts';
import { copyToClipboard } from './clipboard.ts';

const parseAtMention = (
	input: string
): { repoQuery: string; question: string; hasSpace: boolean } | null => {
	if (!input.startsWith('@')) return null;
	const spaceIndex = input.indexOf(' ');
	if (spaceIndex === -1) {
		return { repoQuery: input.slice(1), question: '', hasSpace: false };
	}
	return {
		repoQuery: input.slice(1, spaceIndex),
		question: input.slice(spaceIndex + 1),
		hasSpace: true
	};
};

const AppWrapper: Component<ParentProps> = (props) => {
	return <AppProvider>{props.children}</AppProvider>;
};

const App: Component = () => {
	const renderer = useRenderer();
	const appState = useAppContext();

	const [heightPercent, setHeightPercent] = createSignal<`${number}%`>('100%');

	const getInputText = () => {
		return appState
			.inputState()
			.map((s) => s.content)
			.join('');
	};

	const handleChatSubmit = async () => {
		const inputText = getInputText().trim();
		if (!inputText) return;

		// If showing palettes, let them handle the return key
		if (
			appState.cursorIsCurrentlyIn() === 'command' ||
			appState.cursorIsCurrentlyIn() === 'mention'
		) {
			return;
		}

		if (appState.isLoading()) {
			return;
		}

		const mention = parseAtMention(inputText);
		if (!mention || !mention.question.trim()) {
			appState.addMessage({
				role: 'system',
				content: 'Use @reponame followed by your question. Example: @daytona How do I...?'
			});
			return;
		}

		const targetRepo = appState
			.repos()
			.find((r) => r.name.toLowerCase() === mention.repoQuery.toLowerCase());
		if (!targetRepo) {
			appState.addMessage({
				role: 'system',
				content: `Repo "${mention.repoQuery}" not found. Use /add to add a repo.`
			});
			return;
		}

		// Add user message with InputState for syntax highlighting
		appState.addMessage({
			role: 'user',
			content: appState.inputState()
		});
		// Add initial assistant message that will be updated during streaming
		appState.addMessage({ role: 'assistant', content: 'Syncing repo...' });
		appState.setInputState([]);
		appState.setIsLoading(true);
		appState.setMode('loading');

		let fullResponse = '';
		let currentMessageId: string | null = null;

		try {
			await services.askQuestion([targetRepo.name], mention.question, (event) => {
				if (
					event.type === 'message.part.updated' &&
					'part' in event.properties &&
					event.properties.part?.type === 'text'
				) {
					const part = event.properties.part as { messageID?: string; text?: string };
					const delta = (event.properties as { delta?: string }).delta ?? '';
					if (currentMessageId === part.messageID) {
						fullResponse += delta;
					} else {
						currentMessageId = part.messageID ?? null;
						fullResponse += '\n\n' + (part.text ?? '');
					}
					if (fullResponse.startsWith('\n\n')) {
						fullResponse = fullResponse.slice(2);
					}
					// Update the assistant message in the history directly
					appState.updateLastAssistantMessage(fullResponse);
				}
			});

			await copyToClipboard(fullResponse);

			appState.addMessage({ role: 'system', content: 'Answer copied to clipboard!' });
		} catch (error) {
			appState.addMessage({ role: 'system', content: `Error: ${error}` });
		} finally {
			appState.setIsLoading(false);
			appState.setMode('chat');
		}
	};

	const cancelMode = () => {
		appState.setMode('chat');
		appState.setInputState([]);
		appState.setWizardInput('');
		appState.setModelInput('');
		appState.setRemoveRepoName('');
	};

	useKeyboard((key) => {
		// Debug console toggle
		if (key.raw === '\x00') {
			if (heightPercent() === '100%') {
				setHeightPercent('80%');
				renderer.console.show();
			} else {
				setHeightPercent('100%');
				renderer.console.hide();
			}
			return;
		}

		// Ctrl+C handling
		if (key.name === 'c' && key.ctrl) {
			if (appState.inputState().length > 0) {
				appState.setInputState([]);
			} else {
				renderer.destroy();
			}
			return;
		}

		if (key.name === 'q' && key.ctrl) {
			renderer.destroy();
			return;
		}

		// Escape handling for modes
		if (key.name === 'escape') {
			if (appState.mode() !== 'chat' && appState.mode() !== 'loading') {
				cancelMode();
			} else if (
				appState.cursorIsCurrentlyIn() === 'command' ||
				appState.cursorIsCurrentlyIn() === 'mention'
			) {
				appState.setInputState([]);
			}
			return;
		}

		// Return key for chat submission (only in chat mode, not in palettes)
		if (
			key.name === 'return' &&
			appState.mode() === 'chat' &&
			(appState.cursorIsCurrentlyIn() === 'text' || appState.cursorIsCurrentlyIn() === 'pasted')
		) {
			handleChatSubmit();
			return;
		}
	});

	return <MainUi heightPercent={heightPercent} />;
};

render(
	() => (
		<AppWrapper>
			<App />
		</AppWrapper>
	),
	{
		targetFps: 60,
		consoleOptions: {
			position: ConsolePosition.BOTTOM,
			sizePercent: 20,
			maxStoredLogs: 500
		},
		exitOnCtrlC: false
	}
);
