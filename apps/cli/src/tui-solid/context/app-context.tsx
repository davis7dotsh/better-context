import type { InputRenderable } from '@opentui/core';
import {
	createContext,
	createSignal,
	onMount,
	useContext,
	type Accessor,
	type Component,
	type ParentProps
} from 'solid-js';
import type { Mode, Repo, Message, InputState } from '../types.ts';
import { services } from '../services.ts';

export type { InputState };

export type WizardStep = 'name' | 'url' | 'branch' | 'notes' | 'confirm';
export type ModelConfigStep = 'provider' | 'model' | 'confirm';

type AppState = {
	// Input state
	inputState: Accessor<InputState>;
	setCursorPosition: (position: number) => void;
	cursorIsCurrentlyIn: Accessor<InputState[number]['type']>;
	setInputState: (state: InputState) => void;
	inputRef: Accessor<InputRenderable | null>;
	setInputRef: (ref: InputRenderable | null) => void;

	// Model config
	selectedModel: Accessor<string>;
	selectedProvider: Accessor<string>;
	setModel: (model: string) => void;
	setProvider: (provider: string) => void;

	// Messages
	messageHistory: Accessor<Message[]>;
	addMessage: (message: Message) => void;
	updateLastAssistantMessage: (content: string) => void;
	clearMessages: () => void;

	// Repos
	repos: Accessor<Repo[]>;
	setRepos: (repos: Repo[]) => void;
	addRepo: (repo: Repo) => void;
	removeRepo: (name: string) => void;

	// Mode
	mode: Accessor<Mode>;
	setMode: (mode: Mode) => void;

	// Loading state
	isLoading: Accessor<boolean>;
	setIsLoading: (loading: boolean) => void;
	loadingText: Accessor<string>;
	setLoadingText: (text: string) => void;

	// Add repo wizard state
	wizardStep: Accessor<WizardStep>;
	setWizardStep: (step: WizardStep) => void;
	wizardValues: Accessor<{ name: string; url: string; branch: string; notes: string }>;
	setWizardValues: (values: { name: string; url: string; branch: string; notes: string }) => void;
	wizardInput: Accessor<string>;
	setWizardInput: (input: string) => void;

	// Model config wizard state
	modelStep: Accessor<ModelConfigStep>;
	setModelStep: (step: ModelConfigStep) => void;
	modelValues: Accessor<{ provider: string; model: string }>;
	setModelValues: (values: { provider: string; model: string }) => void;

	// Remove repo state
	removeRepoName: Accessor<string>;
	setRemoveRepoName: (name: string) => void;
};

const defaultMessageHistory: Message[] = [
	{
		role: 'system',
		content:
			"Welcome to btca! Ask anything about the library/framework you're interested in (make sure you @ it first)"
	}
];

const AppContext = createContext<AppState>();

export const useAppContext = () => {
	const context = useContext(AppContext);

	if (!context) {
		throw new Error('useAppContext must be used within an AppProvider');
	}

	return context;
};

export const AppProvider: Component<ParentProps> = (props) => {
	// Model config
	const [selectedModel, setSelectedModel] = createSignal('');
	const [selectedProvider, setSelectedProvider] = createSignal('');

	// Messages
	const [messageHistory, setMessageHistory] = createSignal<Message[]>(defaultMessageHistory);

	// Input state
	const [cursorPosition, setCursorPosition] = createSignal(0);
	const [inputStore, setInputStore] = createSignal<InputState>([]);
	const [inputRef, setInputRef] = createSignal<InputRenderable | null>(null);

	// Repos
	const [repos, setReposSignal] = createSignal<Repo[]>([]);

	// Mode
	const [mode, setMode] = createSignal<Mode>('chat');

	// Loading
	const [isLoading, setIsLoading] = createSignal(false);
	const [loadingText, setLoadingText] = createSignal('');

	// Add repo wizard
	const [wizardStep, setWizardStep] = createSignal<WizardStep>('name');
	const [wizardValues, setWizardValues] = createSignal({
		name: '',
		url: '',
		branch: '',
		notes: ''
	});
	const [wizardInput, setWizardInput] = createSignal('');

	// Model config wizard
	const [modelStep, setModelStep] = createSignal<ModelConfigStep>('provider');
	const [modelValues, setModelValues] = createSignal({ provider: '', model: '' });

	// Remove repo
	const [removeRepoName, setRemoveRepoName] = createSignal('');

	// Load repos and model config on mount
	onMount(() => {
		services.getRepos().then(setReposSignal).catch(console.error);
		services
			.getModel()
			.then((config) => {
				setSelectedProvider(config.provider);
				setSelectedModel(config.model);
			})
			.catch(console.error);
	});

	const state: AppState = {
		// Input
		inputState: inputStore,
		inputRef,
		setInputRef,
		setCursorPosition,
		cursorIsCurrentlyIn: () => {
			const items = inputStore();
			let minIdx = 0;
			for (const item of items) {
				const displayLen =
					item.type === 'pasted' ? `[~${item.lines} lines]`.length : item.content.length;
				const maxIdx = minIdx + displayLen;
				if (cursorPosition() >= minIdx && cursorPosition() <= maxIdx) return item.type;
				minIdx = maxIdx;
			}
			return 'text';
		},
		setInputState: setInputStore,

		// Model
		selectedModel,
		selectedProvider,
		setModel: setSelectedModel,
		setProvider: setSelectedProvider,

		// Messages
		messageHistory,
		addMessage: (message: Message) => {
			setMessageHistory((prev) => [...prev, message]);
		},
		updateLastAssistantMessage: (content: string) => {
			setMessageHistory((prev) => {
				const newHistory = [...prev];
				for (let i = newHistory.length - 1; i >= 0; i--) {
					const msg = newHistory[i];
					if (msg && msg.role === 'assistant') {
						newHistory[i] = { role: 'assistant', content };
						break;
					}
				}
				return newHistory;
			});
		},
		clearMessages: () => {
			setMessageHistory(defaultMessageHistory);
		},

		// Repos
		repos,
		setRepos: setReposSignal,
		addRepo: (repo: Repo) => {
			setReposSignal((prev) => [...prev, repo]);
		},
		removeRepo: (name: string) => {
			setReposSignal((prev) => prev.filter((r) => r.name !== name));
		},

		// Mode
		mode,
		setMode,

		// Loading
		isLoading,
		setIsLoading,
		loadingText,
		setLoadingText,

		// Add repo wizard
		wizardStep,
		setWizardStep,
		wizardValues,
		setWizardValues,
		wizardInput,
		setWizardInput,

		// Model config wizard
		modelStep,
		setModelStep,
		modelValues,
		setModelValues,

		// Remove repo
		removeRepoName,
		setRemoveRepoName
	};

	return <AppContext.Provider value={state}>{props.children}</AppContext.Provider>;
};
