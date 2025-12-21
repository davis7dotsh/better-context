/**
 * Query parsing utilities for @mention syntax and workspace key generation
 */

export interface ParsedQuery {
	repos: string[]; // Sorted alphabetically, deduplicated
	query: string; // Query with @mentions stripped
}

/**
 * Parse @mentions from a query string
 *
 * Examples:
 * - "@svelte @daytona how do stores work?" → { repos: ["daytona", "svelte"], query: "how do stores work?" }
 * - "@svelte how do stores work?" → { repos: ["svelte"], query: "how do stores work?" }
 * - "how do stores work?" → { repos: [], query: "how do stores work?" }
 *
 * Future: "@svelte@v5" for version pinning
 */
export const parseQuery = (input: string): ParsedQuery => {
	// Match @reponame patterns (alphanumeric, hyphens, underscores)
	const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
	const repos: string[] = [];
	let match: RegExpExecArray | null;

	while ((match = mentionRegex.exec(input)) !== null) {
		if (match[1]) {
			repos.push(match[1].toLowerCase());
		}
	}

	// Remove @mentions from query and clean up whitespace
	const query = input.replace(mentionRegex, '').replace(/\s+/g, ' ').trim();

	// Deduplicate and sort alphabetically
	const uniqueRepos = [...new Set(repos)].sort();

	return {
		repos: uniqueRepos,
		query
	};
};

/**
 * Generate a deterministic workspace key from a list of repos
 * Repos are sorted alphabetically and joined with "+"
 *
 * Examples:
 * - ["svelte"] → "svelte"
 * - ["svelte", "daytona"] → "daytona+svelte"
 * - ["daytona", "svelte"] → "daytona+svelte" (same as above)
 */
export const getWorkspaceKey = (repos: string[]): string => {
	if (repos.length === 0) {
		throw new Error('Cannot generate workspace key from empty repos list');
	}
	return [...repos].sort().join('+');
};

/**
 * Merge repos from multiple sources (CLI flags, @mentions, etc.)
 * Returns sorted, deduplicated list
 */
export const mergeRepos = (...repoLists: string[][]): string[] => {
	const all = repoLists.flat().map((r) => r.toLowerCase());
	return [...new Set(all)].sort();
};
