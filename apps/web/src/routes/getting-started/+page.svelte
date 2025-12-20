<script lang="ts">
	import CopyButton from '$lib/CopyButton.svelte';
	import { getShikiStore } from '$lib/stores/ShikiStore.svelte';
	import { getThemeStore } from '$lib/stores/ThemeStore.svelte';

	const INSTALL_CMD = `bun add -g btca opencode-ai && btca`;
	const DEFAULT_REPOS = [
		{
			name: 'svelte',
			url: 'https://github.com/sveltejs/svelte.dev',
			branch: 'main'
		},
		{
			name: 'tailwindcss',
			url: 'https://github.com/tailwindlabs/tailwindcss.com',
			branch: 'main'
		},
		{
			name: 'nextjs',
			url: 'https://github.com/vercel/next.js',
			branch: 'canary'
		}
	] as const;

	const AGENTS_MD_SNIPPET = `## btca

Trigger: user says "use btca" (for codebase/docs questions).

Run:
- btca ask -t <tech> -q "<question>"

Available <tech>: svelte, tailwindcss`;

	const ASK_CMD = `btca ask -t svelte -q "How do stores work in Svelte 5?"`;
	const CHAT_CMD = `btca chat -t svelte`;
	const SERVE_CMD = `btca serve -p 8081`;

	const TECHS = [
		{
			id: 'effect',
			label: 'Effect',
			cmd: 'btca config repos add -n effect -u https://github.com/Effect-TS/effect -b main'
		},
		{
			id: 'react',
			label: 'React',
			cmd: 'btca config repos add -n react -u https://github.com/facebook/react -b main'
		},
		{
			id: 'vue',
			label: 'Vue',
			cmd: 'btca config repos add -n vue -u https://github.com/vuejs/core -b main'
		},
		{
			id: 'daytona',
			label: 'Daytona',
			cmd: 'btca config repos add -n daytona -u https://github.com/daytonaio/daytona -b main'
		},
		{
			id: 'opencode',
			label: 'OpenCode',
			cmd: 'btca config repos add -n opencode -u https://github.com/sst/opencode -b dev'
		},
		{
			id: 'neverthrow',
			label: 'neverthrow',
			cmd: 'btca config repos add -n neverthrow -u https://github.com/supermacro/neverthrow -b master'
		},
		{
			id: 'runed',
			label: 'Runed',
			cmd: 'btca config repos add -n runed -u https://github.com/svecosystem/runed -b main'
		}
	] as const;

	const MODEL_CMD = 'btca config model -p anthropic -m claude-haiku-4-5';

	const FULL_CONFIG_JSON = `{
  "reposDirectory": "~/.local/share/btca/repos",
  "port": 3420,
  "maxInstances": 5,
  "repos": [
    {
      "name": "svelte",
      "url": "https://github.com/sveltejs/svelte.dev",
      "branch": "main",
      "specialNotes": "This is the svelte docs website repo, not the actual svelte repo. Use the docs to answer questions about svelte."
    },
    {
      "name": "tailwindcss",
      "url": "https://github.com/tailwindlabs/tailwindcss.com",
      "branch": "main",
      "specialNotes": "This is the tailwindcss docs website repo, not the actual tailwindcss repo. Use the docs to answer questions about tailwindcss."
    },
    {
      "name": "nextjs",
      "url": "https://github.com/vercel/next.js",
      "branch": "canary"
    }
  ],
  "model": "claude-haiku-4-5",
  "provider": "anthropic"
}`;

	const shikiStore = getShikiStore();
	const themeStore = getThemeStore();
	const shikiTheme = $derived(themeStore.theme === 'dark' ? 'dark-plus' : 'light-plus');

	let copiedTech = $state<string | null>(null);

	const copyTech = async (id: string, text: string) => {
		await navigator.clipboard.writeText(text);
		copiedTech = id;
		window.setTimeout(() => {
			copiedTech = null;
		}, 1400);
	};
</script>

<section class="flex flex-col gap-10">
	<div class="flex flex-col gap-4">
		<div class="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
			<span
				class="inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-700 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300"
				>Getting started</span
			>
			<span class="hidden sm:inline">Install, configure, and use btca effectively.</span>
		</div>

		<h1
			class="text-balance text-4xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-5xl"
		>
			Getting started with btca
		</h1>

		<p
			class="max-w-2xl text-pretty text-base leading-relaxed text-neutral-700 dark:text-neutral-300 sm:text-lg"
		>
			Install <code class="rounded bg-neutral-900/5 px-1.5 py-1 text-sm dark:bg-white/10">btca</code
			>, add it to your agent rules, and start asking questions
		</p>
	</div>

	<section id="install" class="scroll-mt-28">
		<h2 class="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
			Install
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			Install globally with Bun, then run
			<code class="rounded bg-neutral-900/5 px-1.5 py-1 text-xs dark:bg-white/10">btca --help</code
			>.
		</p>

		<div
			class="relative mt-4 min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30"
		>
			<div class="flex items-center justify-between gap-3 p-4">
				<div class="min-w-0 flex-1 overflow-x-auto">
					{#if shikiStore.highlighter}
						{@html shikiStore.highlighter.codeToHtml(INSTALL_CMD, {
							theme: shikiTheme,
							lang: 'bash',
							rootStyle: 'background-color: transparent; padding: 0; margin: 0;'
						})}
					{:else}
						<pre
							class="m-0 whitespace-pre text-sm leading-relaxed text-neutral-900 dark:text-neutral-50"><code
								>{INSTALL_CMD}</code
							></pre>
					{/if}
				</div>
				<CopyButton text={INSTALL_CMD} label="Copy install command" />
			</div>
		</div>

		<div
			class="mt-4 rounded-2xl border border-neutral-200 bg-white/70 p-5 text-sm text-neutral-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-300"
		>
			<div class="font-semibold text-neutral-900 dark:text-neutral-50">
				Ships with these repos by default
			</div>
			<ul class="mt-3 grid gap-2 sm:grid-cols-2">
				{#each DEFAULT_REPOS as repo}
					<li class="min-w-0">
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10"
								>{repo.name}</code
							>
							<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10"
								>{repo.branch}</code
							>
							<span class="truncate text-xs text-neutral-600 dark:text-neutral-400">{repo.url}</span
							>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<section id="project" class="scroll-mt-28">
		<h2 class="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
			Add it to a project
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			Paste this into your project's <code
				class="rounded bg-neutral-900/5 px-1.5 py-1 text-xs dark:bg-white/10">AGENTS.md</code
			>
			so your agent knows when to use btca.
			<span class="font-bold block pt-2">
				Make sure you update the list of technologies to match the ones you have added to btca
				config and need in this project.
			</span>
		</p>

		<div
			class="relative mt-4 min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30"
		>
			<div class="flex items-center justify-between gap-3 p-4">
				<textarea
					class="block w-full min-w-0 flex-1 resize-y bg-transparent font-mono text-sm leading-relaxed text-neutral-900 outline-none dark:text-neutral-50"
					rows="10"
					readonly
					value={AGENTS_MD_SNIPPET}
				></textarea>
				<CopyButton text={AGENTS_MD_SNIPPET} label="Copy AGENTS.md snippet" />
			</div>
		</div>
	</section>

	<section id="using" class="scroll-mt-28">
		<h2 class="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
			Using btca
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			Most of the time you'll use <code
				class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10">ask</code
			>. Use
			<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10">chat</code> for an
			interactive session, and
			<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10">serve</code> when you
			want an HTTP API.
		</p>

		<div class="mt-4 grid gap-4 md:grid-cols-3">
			<div
				class="min-w-0 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-5 shadow-sm dark:border-orange-500/25 dark:bg-orange-500/10"
			>
				<div class="text-sm font-semibold text-neutral-950 dark:text-neutral-50">Ask</div>
				<div class="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
					Answer a single question
				</div>
				<div
					class="relative mt-3 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/40"
				>
					<div class="flex items-center justify-between gap-3 p-4">
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
				class="min-w-0 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-5 shadow-sm dark:border-orange-500/25 dark:bg-orange-500/10"
			>
				<div class="text-sm font-semibold text-neutral-950 dark:text-neutral-50">Chat</div>
				<div class="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
					Open an interactive session
				</div>
				<div
					class="relative mt-3 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/40"
				>
					<div class="flex items-center justify-between gap-3 p-4">
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
				class="min-w-0 rounded-2xl border border-orange-500/20 bg-orange-500/10 p-5 shadow-sm dark:border-orange-500/25 dark:bg-orange-500/10"
			>
				<div class="text-sm font-semibold text-neutral-950 dark:text-neutral-50">Serve</div>
				<div class="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
					Expose an HTTP endpoint for questions.
				</div>
				<div
					class="relative mt-3 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white/70 dark:border-neutral-800 dark:bg-neutral-950/40"
				>
					<div class="flex items-center justify-between gap-3 p-4">
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
				<div class="mt-3 text-xs text-neutral-700 dark:text-neutral-300">
					POST <code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10"
						>/question</code
					>
					with
					<code class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10"
						>&#123;"tech","question"&#125;</code
					>.
				</div>
			</div>
		</div>
	</section>

	<section id="add-tech" class="scroll-mt-28">
		<h2 class="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
			Add tech to btca
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			Click a technology to copy the command that adds it to your btca config.
		</p>

		<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each TECHS as tech}
				<button
					type="button"
					onclick={() => copyTech(tech.id, tech.cmd)}
					class="group min-w-0 rounded-2xl border border-neutral-200 bg-white/70 p-4 text-left shadow-sm hover:bg-white dark:border-neutral-800 dark:bg-neutral-900/30 dark:hover:bg-neutral-900/40"
				>
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0">
							<div class="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
								{tech.label}
							</div>
							<div class="mt-2 truncate font-mono text-xs text-neutral-600 dark:text-neutral-400">
								{tech.cmd}
							</div>
						</div>
						{#if copiedTech === tech.id}
							<span
								class="shrink-0 rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-700 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300"
								>Copied</span
							>
						{:else}
							<span
								class="shrink-0 rounded-full border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-300"
								>Copy</span
							>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	</section>

	<section id="model" class="scroll-mt-28">
		<h2 class="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
			Set the model
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			You can set provider + model via <code
				class="rounded bg-neutral-900/5 px-1 py-0.5 text-xs dark:bg-white/10"
				>btca config model</code
			>. I recommend using Haiku for fast, cheap answers.
		</p>

		<div
			class="relative mt-4 min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30"
		>
			<div class="flex items-center justify-between gap-3 p-4">
				<div class="min-w-0 flex-1 overflow-x-auto">
					{#if shikiStore.highlighter}
						{@html shikiStore.highlighter.codeToHtml(MODEL_CMD, {
							theme: shikiTheme,
							lang: 'bash',
							rootStyle: 'background-color: transparent; padding: 0; margin: 0;'
						})}
					{:else}
						<pre
							class="m-0 whitespace-pre text-sm leading-relaxed text-neutral-900 dark:text-neutral-50"><code
								>{MODEL_CMD}</code
							></pre>
					{/if}
				</div>
				<CopyButton text={MODEL_CMD} label="Copy model command" />
			</div>
		</div>
	</section>

	<section id="full-config" class="scroll-mt-28">
		<h2 class="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
			Full config
		</h2>
		<p class="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
			The config lives at <code
				class="rounded bg-neutral-900/5 px-1.5 py-1 text-xs dark:bg-white/10"
				>~/.config/btca/btca.json</code
			>. You can print the path by running
			<code class="rounded bg-neutral-900/5 px-1.5 py-1 text-xs dark:bg-white/10">btca config</code
			>.
		</p>

		<div
			class="relative mt-4 min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/30"
		>
			<div class="flex items-center justify-between gap-3 p-4">
				<div class="min-w-0 flex-1 max-h-112 overflow-auto">
					{#if shikiStore.highlighter}
						{@html shikiStore.highlighter.codeToHtml(FULL_CONFIG_JSON, {
							theme: shikiTheme,
							lang: 'json',
							rootStyle: 'background-color: transparent; padding: 0; margin: 0;'
						})}
					{:else}
						<pre
							class="m-0 whitespace-pre text-sm leading-relaxed text-neutral-900 dark:text-neutral-50"><code
								>{FULL_CONFIG_JSON}</code
							></pre>
					{/if}
				</div>
				<CopyButton text={FULL_CONFIG_JSON} label="Copy full config JSON" />
			</div>
		</div>
	</section>
</section>
