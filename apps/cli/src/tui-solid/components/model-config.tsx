import { createEffect, createSignal, Show, type Component } from 'solid-js';
import { colors } from '../theme.ts';
import { useKeyboard, usePaste } from '@opentui/solid';
import { useAppContext, type ModelConfigStep } from '../context/app-context.tsx';
import { services } from '../services.ts';

// Track if we just opened the modal to prevent the same keypress from triggering submit
let justOpened = false;

const STEP_INFO: Record<ModelConfigStep, { title: string; hint: string; placeholder: string }> = {
	provider: {
		title: 'Step 1/2: Provider',
		hint: 'Enter provider ID (e.g., "opencode", "anthropic", "openai")',
		placeholder: 'opencode'
	},
	model: {
		title: 'Step 2/2: Model',
		hint: 'Enter model ID (e.g., "big-pickle", "claude-sonnet-4-20250514")',
		placeholder: 'big-pickle'
	},
	confirm: {
		title: 'Confirm',
		hint: 'Press Enter to save, Esc to cancel',
		placeholder: ''
	}
};

export const ModelConfig: Component = () => {
	const appState = useAppContext();

	const [modelInput, setModelInput] = createSignal('');

	const info = () => STEP_INFO[appState.modelStep()];

	useKeyboard((key) => {
		if (key.name === 'c' && key.ctrl) {
			const mode = appState.mode();
			if (mode !== 'config-model') return;
			if (modelInput().length === 0) {
				appState.setMode('chat');
			} else {
				setModelInput('');
			}
		}
	});

	// Reset justOpened flag when mode changes to config-model
	createEffect(() => {
		if (appState.mode() === 'config-model') {
			justOpened = true;
			// Clear the flag after a tick to allow subsequent keypresses
			setTimeout(() => {
				justOpened = false;
			}, 0);
		}
	});

	usePaste(({ text }) => {
		if (appState.mode() !== 'config-model') return;

		const step = appState.modelStep();

		if (step === 'provider' || step === 'model') {
			setModelInput(text.trim());
		}
	});

	const handleSubmit = async () => {
		// Skip if this is the same keypress that opened the modal
		if (justOpened) return;
		const step = appState.modelStep();
		const value = modelInput().trim();

		if (step === 'provider') {
			if (!value) return;
			appState.setModelValues({ ...appState.modelValues(), provider: value });
			appState.setModelStep('model');
			setModelInput(appState.selectedModel());
		} else if (step === 'model') {
			if (!value) return;
			appState.setModelValues({ ...appState.modelValues(), model: value });
			appState.setModelStep('confirm');
		} else if (step === 'confirm') {
			const values = appState.modelValues();
			try {
				const result = await services.updateModel(values.provider, values.model);
				appState.setProvider(result.provider);
				appState.setModel(result.model);
				appState.addMessage({
					role: 'system',
					content: `Model updated: ${result.provider}/${result.model}`
				});
			} catch (error) {
				appState.addMessage({ role: 'system', content: `Error: ${error}` });
			} finally {
				appState.setMode('chat');
			}
		}
	};

	useKeyboard((key) => {
		if (appState.mode() !== 'config-model') return;
		if (key.name === 'escape') {
			appState.setMode('chat');
			setModelInput('');
		} else if (key.name === 'return' && appState.modelStep() === 'confirm') {
			handleSubmit();
		}
	});

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 4,
				left: 0,
				width: '100%',
				zIndex: 100,
				backgroundColor: colors.bgSubtle,
				border: true,
				borderColor: colors.info,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<text fg={colors.info} content={` Configure Model - ${info().title}`} />
			<text fg={colors.textSubtle} content={` ${info().hint}`} />
			<text content="" style={{ height: 1 }} />

			<Show
				when={appState.modelStep() === 'confirm'}
				fallback={
					<box style={{}}>
						<input
							placeholder={info().placeholder}
							placeholderColor={colors.textSubtle}
							textColor={colors.text}
							value={modelInput()}
							onInput={setModelInput}
							onSubmit={handleSubmit}
							focused
							style={{ width: '100%' }}
						/>
					</box>
				}
			>
				<box style={{ flexDirection: 'column', paddingLeft: 1 }}>
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.textMuted} content="Provider: " style={{ width: 12 }} />
						<text fg={colors.text} content={appState.modelValues().provider} />
					</box>
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.textMuted} content="Model:    " style={{ width: 12 }} />
						<text fg={colors.text} content={appState.modelValues().model} />
					</box>
					<text content="" style={{ height: 1 }} />
					<text fg={colors.success} content=" Press Enter to confirm, Esc to cancel" />
				</box>
			</Show>
		</box>
	);
};
