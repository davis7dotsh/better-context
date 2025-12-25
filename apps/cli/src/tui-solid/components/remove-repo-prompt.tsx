import { Show, For, createSignal, createMemo, createEffect, type Component } from 'solid-js';
import { colors } from '../theme.ts';
import { useKeyboard } from '@opentui/solid';
import { useAppContext } from '../context/app-context.tsx';
import { services } from '../services.ts';

export const RemoveRepoPrompt: Component = () => {
	const appState = useAppContext();

	const [selectedIndex, setSelectedIndex] = createSignal(0);
	const [filterText, setFilterText] = createSignal('');
	const [removeRepoName, setRemoveRepoName] = createSignal('');

	const maxVisible = 8;

	useKeyboard((key) => {
		if (key.name === 'c' && key.ctrl) {
			const mode = appState.mode();
			if (mode !== 'remove-repo') return;
			if (removeRepoName().length === 0) {
				appState.setMode('chat');
			} else {
				setRemoveRepoName('');
			}
		}
	});

	const filteredRepos = createMemo(() => {
		const repos = appState.repos();
		const filter = filterText().toLowerCase();
		if (!filter) return repos;
		return repos.filter((repo) => repo.name.toLowerCase().includes(filter));
	});

	// Reset selection when filter changes
	createEffect(() => {
		filterText();
		setSelectedIndex(0);
	});

	const visibleRange = createMemo(() => {
		const start = Math.max(
			0,
			Math.min(selectedIndex() - Math.floor(maxVisible / 2), filteredRepos().length - maxVisible)
		);
		return {
			start,
			repos: filteredRepos().slice(start, start + maxVisible)
		};
	});

	const handleRemoveRepo = async () => {
		const repoName = removeRepoName();
		if (!repoName) return;

		try {
			await services.removeRepo(repoName);
			appState.removeRepo(repoName);
			appState.addMessage({ role: 'system', content: `Removed repo: ${repoName}` });
		} catch (error) {
			appState.addMessage({ role: 'system', content: `Error: ${error}` });
		} finally {
			appState.setMode('chat');
			setRemoveRepoName('');
			setFilterText('');
		}
	};

	const cancelMode = () => {
		appState.setMode('chat');
		setRemoveRepoName('');
		setFilterText('');
	};

	const selectRepo = () => {
		const selectedRepo = filteredRepos()[selectedIndex()];
		if (selectedRepo) {
			setRemoveRepoName(selectedRepo.name);
		}
	};

	useKeyboard((key) => {
		if (key.name === 'escape') {
			cancelMode();
		} else if (removeRepoName()) {
			if (key.name === 'y' || key.raw === 'Y') {
				handleRemoveRepo();
			} else if (key.name === 'n' || key.raw === 'N') {
				cancelMode();
			}
		} else {
			switch (key.name) {
				case 'up':
					if (selectedIndex() > 0) {
						setSelectedIndex(selectedIndex() - 1);
					} else {
						setSelectedIndex(filteredRepos().length - 1);
					}
					break;
				case 'down':
					if (selectedIndex() < filteredRepos().length - 1) {
						setSelectedIndex(selectedIndex() + 1);
					} else {
						setSelectedIndex(0);
					}
					break;
				case 'return':
					selectRepo();
					break;
				case 'backspace':
					setFilterText(filterText().slice(0, -1));
					break;
				default:
					if (key.raw && key.raw.length === 1 && key.raw.match(/[a-zA-Z0-9-_]/)) {
						setFilterText(filterText() + key.raw);
					}
					break;
			}
		}
	});

	return (
		<Show
			when={removeRepoName()}
			fallback={
				<box
					style={{
						position: 'absolute',
						top: '50%',
						left: '50%',
						height: 20,
						marginLeft: -25,
						marginTop: -10,
						width: 50,
						backgroundColor: colors.bgSubtle,
						border: true,
						borderColor: colors.error,
						flexDirection: 'column',
						padding: 2
					}}
				>
					<text fg={colors.error} content=" Remove Repo" />
					<text content="" style={{ height: 1 }} />
					<text
						fg={colors.textMuted}
						content={filterText() ? ` Filter: ${filterText()}` : ' Type to filter, ↑↓ to select'}
					/>
					<text content="" style={{ height: 1 }} />
					<For each={visibleRange().repos}>
						{(repo, i) => {
							const actualIndex = () => visibleRange().start + i();
							const isSelected = () => actualIndex() === selectedIndex();
							return (
								<text
									fg={isSelected() ? colors.accent : colors.text}
									content={isSelected() ? `▸ ${repo.name}` : `  ${repo.name}`}
								/>
							);
						}}
					</For>
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
					borderColor: colors.error,
					flexDirection: 'column',
					padding: 1
				}}
			>
				<text fg={colors.error} content=" Remove Repo" />
				<text content="" style={{ height: 1 }} />
				<text fg={colors.text}>
					{`Are you sure you want to remove "`}
					<span style={{ fg: colors.accent }}>{removeRepoName()}</span>
					{`" from your configuration?`}
				</text>
				<text content="" style={{ height: 1 }} />
				<box style={{ flexDirection: 'row' }}>
					<text fg={colors.success} content=" [Y] Yes, remove" />
					<text fg={colors.textSubtle} content="  " />
					<text fg={colors.textMuted} content="[N/Esc] Cancel" />
				</box>
			</box>
		</Show>
	);
};
