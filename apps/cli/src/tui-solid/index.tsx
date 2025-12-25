import { colors } from './theme.ts';
import { MainInput } from './components/main-input.tsx';
import { StatusBar } from './components/status-bar.tsx';
import { Messages } from './components/messages.tsx';
import { Show, type Accessor, type Component } from 'solid-js';
import { Header } from './components/header.tsx';
import { RepoMentionPalette } from './components/repo-mention-palette.tsx';
import { useAppContext } from './context/app-context.tsx';
import { CommandPalette } from './components/command-palette.tsx';
import { AddResourceWizard } from './components/add-resource-wizard.tsx';
import { RemoveRepoPrompt } from './components/remove-repo-prompt.tsx';
import { ModelConfig } from './components/model-config.tsx';
import { BlessedModelSelect } from './components/blessed-model-select.tsx';

export const MainUi: Component<{
	heightPercent: Accessor<`${number}%`>;
}> = (props) => {
	const appState = useAppContext();

	return (
		<box
			width="100%"
			height={props.heightPercent()}
			style={{
				flexDirection: 'column',
				backgroundColor: colors.bg
			}}
		>
			<Header />
			<Messages />
			<MainInput />

			{/* Command and Mention Palettes */}
			<Show when={appState.mode() === 'chat' && appState.cursorIsCurrentlyIn() === 'mention'}>
				<RepoMentionPalette />
			</Show>
			<Show when={appState.mode() === 'chat' && appState.cursorIsCurrentlyIn() === 'command'}>
				<CommandPalette />
			</Show>

			{/* Wizard Modals */}
			<Show when={appState.mode() === 'add-repo'}>
				<AddResourceWizard />
			</Show>
			<Show when={appState.mode() === 'remove-repo'}>
				<RemoveRepoPrompt />
			</Show>
			<Show when={appState.mode() === 'config-model'}>
				<ModelConfig />
			</Show>
			<Show when={appState.mode() === 'select-blessed-model'}>
				<BlessedModelSelect />
			</Show>

			<StatusBar />
		</box>
	);
};

export async function launchTui() {
	await import('./App.tsx');
}
