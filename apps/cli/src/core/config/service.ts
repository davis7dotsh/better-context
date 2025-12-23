import { FileSystem, Path } from '@effect/platform';
import { Effect, Schema } from 'effect';
import { TaggedError } from 'effect/Data';
import {
	type Config,
	CONFIG_DIRECTORY,
	CONFIG_FILENAME,
	DEFAULT_DATA_DIRECTORY,
	DEFAULT_MODEL,
	DEFAULT_PROVIDER,
	DEFAULT_RESOURCES,
	LegacyConfigSchema,
	StoredConfigSchema,
	legacyRepoToResource
} from './types.ts';
import type { ResourceDefinition } from '../resource/types.ts';
import { expandHome } from '../../lib/utils/files.ts';

export class ConfigError extends TaggedError('ConfigError')<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Collapse home directory to tilde for storage
 */
const collapseHome = (path: string): string => {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
	if (home && path.startsWith(home)) {
		return '~' + path.slice(home.length);
	}
	return path;
};

/**
 * Check if config needs migration.
 * Migration is needed if:
 * 1. Has 'repos' instead of 'resources' (old format)
 * 2. Has legacy keys like 'reposDirectory', 'port', 'maxInstances', 'workspacesDirectory'
 * 3. Has 'resources' but items don't have 'type' field (hybrid format)
 */
const needsMigration = (parsed: unknown): boolean => {
	if (typeof parsed !== 'object' || parsed === null) return false;
	const obj = parsed as Record<string, unknown>;

	// Has legacy 'repos' array
	if ('repos' in obj && Array.isArray(obj.repos)) return true;

	// Has legacy keys that should be removed
	if ('reposDirectory' in obj) return true;
	if ('workspacesDirectory' in obj) return true;
	if ('port' in obj) return true;
	if ('maxInstances' in obj) return true;

	// Has 'resources' but items are missing 'type' field (hybrid format)
	if ('resources' in obj && Array.isArray(obj.resources)) {
		const resources = obj.resources as unknown[];
		if (resources.length > 0) {
			const first = resources[0] as Record<string, unknown> | undefined;
			if (first && !('type' in first)) return true;
		}
	}

	return false;
};

interface MigratedResource {
	type: 'git';
	name: string;
	url: string;
	branch: string;
	specialNotes?: string;
	searchPath?: string;
}

interface MigratedConfig {
	resources: MigratedResource[];
	model: string;
	provider: string;
	dataDirectory?: string;
}

/**
 * Migrate a legacy or hybrid config to the new format
 */
const migrateConfig = (parsed: Record<string, unknown>): MigratedConfig => {
	// Get resources from either 'repos' or 'resources' field
	let rawResources: unknown[] = [];
	if ('repos' in parsed && Array.isArray(parsed.repos)) {
		rawResources = parsed.repos;
	} else if ('resources' in parsed && Array.isArray(parsed.resources)) {
		rawResources = parsed.resources;
	}

	// Convert each resource, adding 'type: git' if missing
	const resources: MigratedResource[] = rawResources.map((r) => {
		const resource = r as Record<string, unknown>;
		const result: MigratedResource = {
			type: 'git',
			name: String(resource.name ?? ''),
			url: String(resource.url ?? ''),
			branch: String(resource.branch ?? 'main')
		};
		if (resource.specialNotes) {
			result.specialNotes = String(resource.specialNotes);
		}
		if (resource.searchPath) {
			result.searchPath = String(resource.searchPath);
		}
		return result;
	});

	const result: MigratedConfig = {
		resources,
		model: String(parsed.model ?? DEFAULT_MODEL),
		provider: String(parsed.provider ?? DEFAULT_PROVIDER)
	};

	// Only include dataDirectory if it was explicitly set and isn't default
	if (parsed.dataDirectory && parsed.dataDirectory !== DEFAULT_DATA_DIRECTORY) {
		result.dataDirectory = String(parsed.dataDirectory);
	}

	return result;
};

/**
 * Load and potentially migrate config from disk
 */
const loadConfig = Effect.gen(function* () {
	const pathService = yield* Path.Path;
	const fs = yield* FileSystem.FileSystem;

	const configDir = yield* expandHome(CONFIG_DIRECTORY);
	const configPath = pathService.join(configDir, CONFIG_FILENAME);
	const dataDir = yield* expandHome(DEFAULT_DATA_DIRECTORY);

	const exists = yield* fs.exists(configPath);

	if (!exists) {
		// Create default config
		yield* Effect.log(`Config file not found at ${configPath}, creating default config...`);

		yield* fs
			.makeDirectory(configDir, { recursive: true })
			.pipe(Effect.catchAll(() => Effect.void));

		const defaultStored: typeof StoredConfigSchema.Type = {
			resources: DEFAULT_RESOURCES,
			model: DEFAULT_MODEL,
			provider: DEFAULT_PROVIDER
		};

		yield* fs
			.writeFileString(configPath, JSON.stringify(defaultStored, null, 2))
			.pipe(
				Effect.mapError(
					(e) => new ConfigError({ message: 'Failed to create default config', cause: e })
				)
			);

		yield* Effect.log(`Default config created at ${configPath}`);

		const config: Config = {
			dataDirectory: dataDir,
			resourcesDirectory: pathService.join(dataDir, 'resources'),
			collectionsDirectory: pathService.join(dataDir, 'collections'),
			configPath,
			resources: DEFAULT_RESOURCES,
			model: DEFAULT_MODEL,
			provider: DEFAULT_PROVIDER
		};

		return config;
	}

	// Load existing config
	const content = yield* fs
		.readFileString(configPath)
		.pipe(
			Effect.mapError((e) => new ConfigError({ message: 'Failed to read config file', cause: e }))
		);

	const parsed = JSON.parse(content) as Record<string, unknown>;

	// Check if migration is needed
	if (needsMigration(parsed)) {
		yield* Effect.log('Detected legacy/hybrid config format, migrating to new format...');

		const migrated = migrateConfig(parsed);

		// Write migrated config
		yield* fs
			.writeFileString(configPath, JSON.stringify(migrated, null, 2))
			.pipe(
				Effect.mapError(
					(e) => new ConfigError({ message: 'Failed to write migrated config', cause: e })
				)
			);

		yield* Effect.log('Config migrated successfully');

		const config: Config = {
			dataDirectory: dataDir,
			resourcesDirectory: pathService.join(dataDir, 'resources'),
			collectionsDirectory: pathService.join(dataDir, 'collections'),
			configPath,
			resources: migrated.resources,
			model: migrated.model,
			provider: migrated.provider
		};

		return config;
	}

	// Parse new format
	const stored = yield* Schema.decodeUnknown(StoredConfigSchema)(parsed).pipe(
		Effect.mapError((e) => new ConfigError({ message: 'Failed to parse config', cause: e }))
	);

	const resolvedDataDir = stored.dataDirectory ? yield* expandHome(stored.dataDirectory) : dataDir;

	const config: Config = {
		dataDirectory: resolvedDataDir,
		resourcesDirectory: pathService.join(resolvedDataDir, 'resources'),
		collectionsDirectory: pathService.join(resolvedDataDir, 'collections'),
		configPath,
		resources: [...stored.resources],
		model: stored.model,
		provider: stored.provider
	};

	return config;
});

/**
 * Create the config service
 */
const createConfigService = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;

	let config = yield* loadConfig;

	const saveConfig = Effect.gen(function* () {
		const stored: typeof StoredConfigSchema.Type = {
			dataDirectory: collapseHome(config.dataDirectory),
			resources: config.resources,
			model: config.model,
			provider: config.provider
		};

		yield* fs
			.writeFileString(config.configPath, JSON.stringify(stored, null, 2))
			.pipe(
				Effect.mapError((e) => new ConfigError({ message: 'Failed to save config', cause: e }))
			);
	});

	return {
		/**
		 * Get the current config
		 */
		getConfig: (): Effect.Effect<Config> => Effect.succeed(config),

		/**
		 * Get the config file path
		 */
		getConfigPath: (): Effect.Effect<string> => Effect.succeed(config.configPath),

		/**
		 * Get the resources directory path
		 */
		getResourcesDirectory: (): Effect.Effect<string> => Effect.succeed(config.resourcesDirectory),

		/**
		 * Get the collections directory path
		 */
		getCollectionsDirectory: (): Effect.Effect<string> =>
			Effect.succeed(config.collectionsDirectory),

		/**
		 * Get all resource definitions
		 */
		getResources: (): Effect.Effect<ResourceDefinition[]> => Effect.succeed(config.resources),

		/**
		 * Get the current model and provider
		 */
		getModel: (): Effect.Effect<{ model: string; provider: string }> =>
			Effect.succeed({ model: config.model, provider: config.provider }),

		/**
		 * Update the model and provider
		 */
		updateModel: (args: {
			model: string;
			provider: string;
		}): Effect.Effect<{ model: string; provider: string }, ConfigError, FileSystem.FileSystem> =>
			Effect.gen(function* () {
				config = { ...config, model: args.model, provider: args.provider };
				yield* saveConfig;
				return { model: config.model, provider: config.provider };
			}),

		/**
		 * Add a resource
		 */
		addResource: (
			resource: ResourceDefinition
		): Effect.Effect<ResourceDefinition, ConfigError, FileSystem.FileSystem> =>
			Effect.gen(function* () {
				const existing = config.resources.find((r) => r.name === resource.name);
				if (existing) {
					return yield* Effect.fail(
						new ConfigError({ message: `Resource "${resource.name}" already exists` })
					);
				}
				config = { ...config, resources: [...config.resources, resource] };
				yield* saveConfig;
				return resource;
			}),

		/**
		 * Remove a resource by name
		 */
		removeResource: (name: string): Effect.Effect<void, ConfigError, FileSystem.FileSystem> =>
			Effect.gen(function* () {
				const existing = config.resources.find((r) => r.name === name);
				if (!existing) {
					return yield* Effect.fail(new ConfigError({ message: `Resource "${name}" not found` }));
				}
				config = { ...config, resources: config.resources.filter((r) => r.name !== name) };
				yield* saveConfig;
			}),

		/**
		 * Get a resource definition by name
		 */
		getResource: (name: string): Effect.Effect<ResourceDefinition, ConfigError> =>
			Effect.gen(function* () {
				const resource = config.resources.find((r) => r.name === name);
				if (!resource) {
					return yield* Effect.fail(new ConfigError({ message: `Resource "${name}" not found` }));
				}
				return resource;
			})
	};
});

export type ConfigService = Effect.Effect.Success<typeof createConfigService>;

export { createConfigService, loadConfig };
