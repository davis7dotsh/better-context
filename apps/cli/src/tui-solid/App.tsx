import { createSignal, type Component } from 'solid-js';
import type { ParentProps } from 'solid-js';
import { AppProvider } from './context/app-context';
import { render, useKeyboard, useRenderer } from '@opentui/solid';
import { MainUi } from '.';
import { ConsolePosition } from '@opentui/core';
import { useAppContext } from './context/app-context.tsx';
import { services } from './services.ts';
import { copyToClipboard } from './clipboard.ts';

/**
 * Parse all @mentions from input text.
 * Returns the list of mentioned repos and the question with mentions stripped.
 */
const parseAllMentions = (input: string): { repos: string[]; question: string } => {
	const mentionRegex = /@(\w+)/g;
	const repos: string[] = [];
	let match;

	while ((match = mentionRegex.exec(input)) !== null) {
		repos.push(match[1]!);
	}

	// Remove @mentions from the question
	const question = input.replace(mentionRegex, '').trim().replace(/\s+/g, ' ');

	return { repos: [...new Set(repos)], question };
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

		const parsed = parseAllMentions(inputText);
		if (parsed.repos.length === 0 || !parsed.question.trim()) {
			appState.addMessage({
				role: 'system',
				content: 'Use @reponame followed by your question. Example: @svelte @effect How do I...?'
			});
			return;
		}

		// Validate all mentioned repos exist
		const availableRepos = appState.repos();
		const validRepos: string[] = [];
		const invalidRepos: string[] = [];

		for (const repoName of parsed.repos) {
			const found = availableRepos.find((r) => r.name.toLowerCase() === repoName.toLowerCase());
			if (found) {
				validRepos.push(found.name);
			} else {
				invalidRepos.push(repoName);
			}
		}

		if (invalidRepos.length > 0) {
			appState.addMessage({
				role: 'system',
				content: `Repo(s) not found: ${invalidRepos.join(', ')}. Use /add to add a repo.`
			});
			return;
		}

		// Add user message with InputState for syntax highlighting
		appState.addMessage({
			role: 'user',
			content: appState.inputState()
		});
		// Add initial assistant message that will be updated during streaming
		const repoLabel = validRepos.length === 1 ? 'repo' : 'repos';
		appState.addMessage({ role: 'assistant', content: `Syncing ${repoLabel}...` });
		appState.setInputState([]);
		appState.setIsLoading(true);
		appState.setMode('loading');

		let fullResponse = '';
		let currentMessageId: string | null = null;

		try {
			await services.askQuestion(validRepos, parsed.question, (event) => {
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
