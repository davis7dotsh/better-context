import { For, Show, Switch, Match, createSignal, onCleanup, type Component } from 'solid-js';
import { useAppContext } from '../context/app-context';
import { colors, getColor } from '../theme';
import { MarkdownText } from './markdown-text.tsx';
import type { BtcaChunk } from '../../core/index.ts';
import type { AssistantContent } from '../types.ts';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const LoadingSpinner: Component = () => {
	const [frameIndex, setFrameIndex] = createSignal(0);

	const interval = setInterval(() => {
		setFrameIndex((prev) => (prev + 1) % spinnerFrames.length);
	}, 80);

	onCleanup(() => clearInterval(interval));

	return <text fg={colors.success}>{spinnerFrames[frameIndex()]} </text>;
};

const ToolChunk: Component<{ chunk: Extract<BtcaChunk, { type: 'tool' }> }> = (props) => {
	const stateIcon = () => {
		switch (props.chunk.state) {
			case 'pending':
				return '○';
			case 'running':
				return '◐';
			case 'completed':
				return '●';
		}
	};

	const stateColor = () => {
		switch (props.chunk.state) {
			case 'pending':
				return colors.textMuted;
			case 'running':
				return colors.accent;
			case 'completed':
				return colors.success;
		}
	};

	return (
		<box style={{ flexDirection: 'row', gap: 1 }}>
			<text fg={stateColor()}>{stateIcon()}</text>
			<text fg={colors.textMuted}>{props.chunk.toolName}</text>
		</box>
	);
};

const FileChunk: Component<{ chunk: Extract<BtcaChunk, { type: 'file' }> }> = (props) => {
	return (
		<box style={{ flexDirection: 'row', gap: 1 }}>
			<text fg={colors.info}>📄</text>
			<text fg={colors.textMuted}>{props.chunk.filePath}</text>
		</box>
	);
};

const ReasoningChunk: Component<{
	chunk: Extract<BtcaChunk, { type: 'reasoning' }>;
	isStreaming: boolean;
}> = (props) => {
	return (
		<box style={{ flexDirection: 'column', gap: 0 }}>
			<box style={{ flexDirection: 'row', gap: 1 }}>
				<text fg={colors.textSubtle}>💭 thinking</text>
				<Show when={props.isStreaming}>
					<LoadingSpinner />
				</Show>
			</box>
			<text fg={colors.textSubtle}>{props.chunk.text}</text>
		</box>
	);
};

const TextChunk: Component<{
	chunk: Extract<BtcaChunk, { type: 'text' }>;
	isStreaming: boolean;
}> = (props) => {
	return (
		<Show when={!props.isStreaming} fallback={<text>{props.chunk.text}</text>}>
			<MarkdownText content={props.chunk.text} />
		</Show>
	);
};

const ChunkRenderer: Component<{ chunk: BtcaChunk; isStreaming: boolean }> = (props) => {
	return (
		<Switch>
			<Match when={props.chunk.type === 'tool'}>
				<ToolChunk chunk={props.chunk as Extract<BtcaChunk, { type: 'tool' }>} />
			</Match>
			<Match when={props.chunk.type === 'file'}>
				<FileChunk chunk={props.chunk as Extract<BtcaChunk, { type: 'file' }>} />
			</Match>
			<Match when={props.chunk.type === 'reasoning'}>
				<ReasoningChunk
					chunk={props.chunk as Extract<BtcaChunk, { type: 'reasoning' }>}
					isStreaming={props.isStreaming}
				/>
			</Match>
			<Match when={props.chunk.type === 'text'}>
				<TextChunk
					chunk={props.chunk as Extract<BtcaChunk, { type: 'text' }>}
					isStreaming={props.isStreaming}
				/>
			</Match>
		</Switch>
	);
};

const AssistantMessage: Component<{
	content: AssistantContent;
	isStreaming: boolean;
}> = (props) => {
	return (
		<Switch>
			<Match when={props.content.type === 'text'}>
				<Show
					when={!props.isStreaming}
					fallback={<text>{(props.content as { type: 'text'; content: string }).content}</text>}
				>
					<MarkdownText content={(props.content as { type: 'text'; content: string }).content} />
				</Show>
			</Match>
			<Match when={props.content.type === 'chunks'}>
				<box style={{ flexDirection: 'column', gap: 1 }}>
					<For each={(props.content as { type: 'chunks'; chunks: BtcaChunk[] }).chunks}>
						{(chunk, idx) => {
							const isLastChunk = () =>
								idx() ===
								(props.content as { type: 'chunks'; chunks: BtcaChunk[] }).chunks.length - 1;
							return (
								<ChunkRenderer chunk={chunk} isStreaming={props.isStreaming && isLastChunk()} />
							);
						}}
					</For>
				</box>
			</Match>
		</Switch>
	);
};

export const Messages: Component = () => {
	const appState = useAppContext();

	return (
		<scrollbox
			style={{
				flexGrow: 1,
				rootOptions: {
					border: true,
					borderColor: colors.border
				},
				contentOptions: {
					flexDirection: 'column',
					padding: 1,
					gap: 2
				},
				stickyScroll: true,
				stickyStart: 'bottom'
			}}
		>
			<For each={appState.messageHistory()}>
				{(m, index) => {
					if (m.role === 'user') {
						return (
							<box style={{ flexDirection: 'column', gap: 1 }}>
								<text fg={colors.accent}>You </text>
								<text>
									<For each={m.content}>
										{(part) => <span style={{ fg: getColor(part.type) }}>{part.content}</span>}
									</For>
								</text>
							</box>
						);
					}
					if (m.role === 'system') {
						return (
							<box style={{ flexDirection: 'column', gap: 1 }}>
								<text fg={colors.info}>SYS </text>
								<text fg={colors.text} content={`${m.content}`} />
							</box>
						);
					}
					if (m.role === 'assistant') {
						const isLastAssistant = () => {
							const history = appState.messageHistory();
							for (let i = history.length - 1; i >= 0; i--) {
								if (history[i]?.role === 'assistant') {
									return i === index();
								}
							}
							return false;
						};
						const isStreaming = () => appState.mode() === 'loading' && isLastAssistant();

						return (
							<box style={{ flexDirection: 'column', gap: 1 }}>
								<box style={{ flexDirection: 'row' }}>
									<text fg={colors.success}>AI </text>
									<Show when={isStreaming()}>
										<LoadingSpinner />
									</Show>
								</box>
								<AssistantMessage content={m.content} isStreaming={isStreaming()} />
							</box>
						);
					}
				}}
			</For>
		</scrollbox>
	);
};
