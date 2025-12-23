/**
 * Collection types
 *
 * A collection is an assembled group of resources in a single directory.
 * Collections are created on-demand using symlinks to cached resources.
 */

export interface CollectionInfo {
	key: string; // e.g., "effect+svelte"
	path: string; // absolute path to collection directory
	resources: string[]; // sorted list of resource names
}

/**
 * Generate a deterministic collection key from resource names.
 * Resources are sorted alphabetically and joined with "+".
 *
 * @example
 * getCollectionKey(["svelte"]) // => "svelte"
 * getCollectionKey(["svelte", "effect"]) // => "effect+svelte"
 * getCollectionKey(["effect", "svelte"]) // => "effect+svelte" (same)
 */
export const getCollectionKey = (resourceNames: string[]): string => {
	if (resourceNames.length === 0) {
		throw new Error('Cannot generate collection key from empty resource list');
	}
	return [...resourceNames].sort().join('+');
};

/**
 * Parse resource names from a collection key.
 *
 * @example
 * parseCollectionKey("effect+svelte") // => ["effect", "svelte"]
 * parseCollectionKey("svelte") // => ["svelte"]
 */
export const parseCollectionKey = (key: string): string[] => {
	return key.split('+').sort();
};
