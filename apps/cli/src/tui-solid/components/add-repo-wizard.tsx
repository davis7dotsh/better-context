import { createSignal, Show, type Component } from 'solid-js';
import { colors } from '../theme.ts';
import { useKeyboard, usePaste } from '@opentui/solid';
import { useAppContext, type WizardStep } from '../context/app-context.tsx';
import { services } from '../services.ts';
import type { Repo } from '../types.ts';

const STEP_INFO: Record<WizardStep, { title: string; hint: string; placeholder: string }> = {
	name: {
		title: 'Step 1/4: Repository Name',
		hint: 'Enter a unique name for this repo (e.g., "react", "svelte-docs")',
		placeholder: 'repo-name'
	},
	url: {
		title: 'Step 2/4: Repository URL',
		hint: 'Enter the GitHub repository URL',
		placeholder: 'https://github.com/owner/repo'
	},
	branch: {
		title: 'Step 3/4: Branch',
		hint: 'Enter the branch to clone (press Enter for "main")',
		placeholder: 'main'
	},
	notes: {
		title: 'Step 4/4: Special Notes (Optional)',
		hint: 'Any special notes for the AI? Press Enter to skip',
		placeholder: 'e.g., "This is the docs website, not the library"'
	},
	confirm: {
		title: 'Confirm',
		hint: 'Press Enter to add repo, Esc to cancel',
		placeholder: ''
	}
};

export const AddRepoWizard: Component = () => {
	const appState = useAppContext();

	const [wizardInput, setWizardInput] = createSignal('');

	const info = () => STEP_INFO[appState.wizardStep()];

	useKeyboard((key) => {
		if (key.name === 'c' && key.ctrl) {
			const mode = appState.mode();
			if (mode !== 'add-repo') return;
			if (wizardInput().length === 0) {
				appState.setMode('chat');
			} else {
				setWizardInput('');
			}
		}
	});
	usePaste(({ text }) => {
		setWizardInput(text);
	});

	const handleSubmit = async () => {
		const step = appState.wizardStep();
		const value = wizardInput().trim();

		if (step === 'name') {
			if (!value) return;
			appState.setWizardValues({ ...appState.wizardValues(), name: value });
			appState.setWizardStep('url');
			setWizardInput('');
		} else if (step === 'url') {
			if (!value) return;
			appState.setWizardValues({ ...appState.wizardValues(), url: value });
			appState.setWizardStep('branch');
			setWizardInput('main');
		} else if (step === 'branch') {
			appState.setWizardValues({ ...appState.wizardValues(), branch: value || 'main' });
			appState.setWizardStep('notes');
			setWizardInput('');
		} else if (step === 'notes') {
			appState.setWizardValues({ ...appState.wizardValues(), notes: value });
			appState.setWizardStep('confirm');
		} else if (step === 'confirm') {
			const values = appState.wizardValues();
			const newRepo: Repo = {
				name: values.name,
				url: values.url,
				branch: values.branch || 'main',
				...(values.notes && { specialNotes: values.notes })
			};

			try {
				await services.addRepo(newRepo);
				appState.addRepo(newRepo);
				appState.addMessage({ role: 'system', content: `Added repo: ${newRepo.name}` });
			} catch (error) {
				appState.addMessage({ role: 'system', content: `Error: ${error}` });
			} finally {
				appState.setMode('chat');
			}
		}
	};

	useKeyboard((key) => {
		if (key.name === 'escape') {
			appState.setMode('chat');
			setWizardInput('');
		} else if (key.name === 'return' && appState.wizardStep() === 'confirm') {
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
			<text fg={colors.info} content={` Add Repo - ${info().title}`} />
			<text fg={colors.textSubtle} content={` ${info().hint}`} />
			<text content="" style={{ height: 1 }} />

			<Show
				when={appState.wizardStep() === 'confirm'}
				fallback={
					<box style={{}}>
						<input
							placeholder={info().placeholder}
							placeholderColor={colors.textSubtle}
							textColor={colors.text}
							value={wizardInput()}
							onInput={setWizardInput}
							onSubmit={handleSubmit}
							focused
							style={{ width: '100%' }}
						/>
					</box>
				}
			>
				<box style={{ flexDirection: 'column', paddingLeft: 1 }}>
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.textMuted} content="Name:   " style={{ width: 10 }} />
						<text fg={colors.text} content={appState.wizardValues().name} />
					</box>
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.textMuted} content="URL:    " style={{ width: 10 }} />
						<text fg={colors.text} content={appState.wizardValues().url} />
					</box>
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.textMuted} content="Branch: " style={{ width: 10 }} />
						<text fg={colors.text} content={appState.wizardValues().branch || 'main'} />
					</box>
					<Show when={appState.wizardValues().notes}>
						<box style={{ flexDirection: 'row' }}>
							<text fg={colors.textMuted} content="Notes:  " style={{ width: 10 }} />
							<text fg={colors.text} content={appState.wizardValues().notes} />
						</box>
					</Show>
					<text content="" style={{ height: 1 }} />
					<text fg={colors.success} content=" Press Enter to confirm, Esc to cancel" />
				</box>
			</Show>
		</box>
	);
};
