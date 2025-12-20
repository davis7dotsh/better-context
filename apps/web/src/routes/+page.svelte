<script lang="ts">
	import CopyButton from '$lib/CopyButton.svelte';
	import { getShikiStore } from '$lib/stores/ShikiStore.svelte';
	import { getThemeStore } from '$lib/stores/ThemeStore.svelte';

	const INSTALL_CMD = `bun add -g btca opencode-ai && btca`;

	const ASK_CMD = `btca ask -t svelte -q "How do stores work in Svelte 5?"`;
	const CHAT_CMD = `btca chat -t svelte`;
	const SERVE_CMD = `btca serve -p 8080`;
	const OPEN_CMD = `btca open`;

	const shikiStore = getShikiStore();
	const themeStore = getThemeStore();
	const shikiTheme = $derived(themeStore.theme === 'dark' ? 'dark-plus' : 'light-plus');
</script>

<section class="flex flex-col gap-10">
	<div class="flex flex-col gap-4">
		<div class="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
			<span
				class="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-700 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300"
				>AI Powered Docs Search</span
			>
			<span class="hidden sm:inline"
				>Ask a Question, Search the Actual Codebase, Get a Real Answer.</span
			>
		</div>

		<h1
			class="text-balance text-4xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-5xl"
		>
			Up to Date Info About any Technology
		</h1>

		<p
			class="max-w-2xl text-pretty text-base leading-relaxed text-neutral-700 dark:text-neutral-300 sm:text-lg"
		>
			<code class="rounded bg-neutral-900/5 px-1.5 py-1 text-sm dark:bg-white/10">btca</code>
			is a CLI for asking questions about libraries/frameworks by cloning their repos locally and searching
			the source directly
		</p>

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<a
				href="/getting-started"
				class="inline-flex items-center justify-center rounded-2xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white no-underline shadow-sm shadow-orange-600/20 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-500"
			>
				Get started
			</a>
			<a
				href="https://github.com/bmdavis419/better-context"
				target="_blank"
				rel="noreferrer"
				class="inline-flex items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 no-underline shadow-sm hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-50 dark:hover:bg-neutral-900"
			>
				View on GitHub
			</a>
		</div>
	</div>

	<section id="install" class="scroll-mt-28">
		<h2 class="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
			Install
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			Install globally with Bun, then run <code
				class="rounded bg-neutral-900/5 px-1.5 py-1 text-xs dark:bg-white/10">btca --help</code
			>.
		</p>
		<div
			class="relative mt-4 min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30 p-4 h-20 flex flex-row items-center justify-between"
		>
			<div class="min-w-0 flex-1 overflow-x-auto">
				{#if shikiStore.highlighter}
					{@html shikiStore.highlighter.codeToHtml(INSTALL_CMD, {
						theme: shikiTheme,
						lang: 'bash',
						rootStyle: 'background-color: transparent; padding: 0; margin: 0; height: 100%;'
					})}
				{:else}
					<pre
						class="m-0 h-full whitespace-pre p-0 leading-relaxed text-neutral-900 dark:text-neutral-50"><code
							>{INSTALL_CMD}</code
						></pre>
				{/if}
			</div>
			<CopyButton text={INSTALL_CMD} label="Copy install command" />
		</div>
	</section>

	<section id="commands" class="scroll-mt-28">
		<h2 class="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
			Quick commands
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			The CLI currently ships these subcommands:
			<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10">ask</code>,
			<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10">chat</code>,
			<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10">serve</code>,
			<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10">open</code>.
		</p>

		<div class="mt-4 grid gap-4 md:grid-cols-2">
			<div
				class="min-w-0 rounded-2xl border border-neutral-200 bg-white/70 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30"
			>
				<div class="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
					Ask a question
				</div>
				<div
					class="relative mt-3 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
				>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0 flex-1 overflow-x-auto">
							{#if shikiStore.highlighter}
								{@html shikiStore.highlighter.codeToHtml(ASK_CMD, {
									theme: shikiTheme,
									lang: 'bash',
									rootStyle: 'background-color: transparent; padding: 0; margin: 0;'
								})}
							{:else}
								<pre
									class="m-0 whitespace-pre text-sm leading-relaxed text-neutral-900 dark:text-neutral-50"><code
										>{ASK_CMD}</code
									></pre>
							{/if}
						</div>
						<CopyButton text={ASK_CMD} label="Copy ask command" />
					</div>
				</div>
			</div>
			<div
				class="min-w-0 rounded-2xl border border-neutral-200 bg-white/70 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30"
			>
				<div class="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Open the TUI</div>
				<div
					class="relative mt-3 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
				>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0 flex-1 overflow-x-auto">
							{#if shikiStore.highlighter}
								{@html shikiStore.highlighter.codeToHtml(CHAT_CMD, {
									theme: shikiTheme,
									lang: 'bash',
									rootStyle: 'background-color: transparent; padding: 0; margin: 0;'
								})}
							{:else}
								<pre
									class="m-0 whitespace-pre text-sm leading-relaxed text-neutral-900 dark:text-neutral-50"><code
										>{CHAT_CMD}</code
									></pre>
							{/if}
						</div>
						<CopyButton text={CHAT_CMD} label="Copy chat command" />
					</div>
				</div>
			</div>
			<div
				class="min-w-0 rounded-2xl border border-neutral-200 bg-white/70 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30"
			>
				<div class="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
					Run as a server
				</div>
				<div
					class="relative mt-3 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
				>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0 flex-1 overflow-x-auto">
							{#if shikiStore.highlighter}
								{@html shikiStore.highlighter.codeToHtml(SERVE_CMD, {
									theme: shikiTheme,
									lang: 'bash',
									rootStyle: 'background-color: transparent; padding: 0; margin: 0;'
								})}
							{:else}
								<pre
									class="m-0 whitespace-pre text-sm leading-relaxed text-neutral-900 dark:text-neutral-50"><code
										>{SERVE_CMD}</code
									></pre>
							{/if}
						</div>
						<CopyButton text={SERVE_CMD} label="Copy serve command" />
					</div>
				</div>
				<div class="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
					POST <code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10"
						>/question</code
					>
					with
					<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10"
						>&#123;"tech","question"&#125;</code
					>.
				</div>
			</div>
			<div
				class="min-w-0 rounded-2xl border border-neutral-200 bg-white/70 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30"
			>
				<div class="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
					Keep an OpenCode instance running
				</div>
				<div
					class="relative mt-3 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
				>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0 flex-1 overflow-x-auto">
							{#if shikiStore.highlighter}
								{@html shikiStore.highlighter.codeToHtml(OPEN_CMD, {
									theme: shikiTheme,
									lang: 'bash',
									rootStyle: 'background-color: transparent; padding: 0; margin: 0;'
								})}
							{:else}
								<pre
									class="m-0 whitespace-pre text-sm leading-relaxed text-neutral-900 dark:text-neutral-50"><code
										>{OPEN_CMD}</code
									></pre>
							{/if}
						</div>
						<CopyButton text={OPEN_CMD} label="Copy open command" />
					</div>
				</div>
			</div>
		</div>
	</section>

	<section id="config" class="scroll-mt-28">
		<h2 class="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
			Config
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			On first run, <code class="rounded bg-neutral-900/5 px-1.5 py-1 text-xs dark:bg-white/10"
				>btca</code
			>
			creates a default config at
			<code class="rounded bg-neutral-900/5 px-1.5 py-1 text-xs dark:bg-white/10"
				>~/.config/btca/btca.json</code
			>. That’s where repo list + model/provider live.
		</p>
	</section>
</section>
