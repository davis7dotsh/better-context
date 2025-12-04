import type { Config as OpenCodeConfig } from "@opencode-ai/sdk";
import { Effect, Schema } from "effect";
import * as path from "node:path";
import { getDocsAgentPrompt } from "../lib/prompts.ts";
import { ConfigError } from "../lib/errors.ts";
import { cloneRepo, pullRepo } from "../lib/utils/git.ts";
import { directoryExists, expandHome } from "../lib/utils/files.ts";

const CONFIG_DIRECTORY = "~/.config/btca";
const CONFIG_FILENAME = "btca.json";

// TODO: figure out why grok code sucks so much

const repoSchema = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
  branch: Schema.String,
});

type Repo = typeof repoSchema.Type;

const configSchema = Schema.Struct({
  promptsDirectory: Schema.String,
  reposDirectory: Schema.String,
  port: Schema.Number,
  maxInstances: Schema.Number,
  repos: Schema.Array(repoSchema),
  model: Schema.String,
  provider: Schema.String,
});

type Config = typeof configSchema.Type;

const DEFAULT_CONFIG: Config = {
  promptsDirectory: `${CONFIG_DIRECTORY}/prompts`,
  reposDirectory: `${CONFIG_DIRECTORY}/repos`,
  port: 3420,
  maxInstances: 5,
  repos: [
    {
      name: "svelte",
      url: "https://github.com/sveltejs/svelte.dev",
      branch: "main",
    },
    {
      name: "effect",
      url: "https://github.com/Effect-TS/effect",
      branch: "main",
    },
    {
      name: "nextjs",
      url: "https://github.com/vercel/next.js",
      branch: "canary",
    },
  ],
  model: "big-pickle",
  provider: "opencode",
};

const OPENCODE_CONFIG = (args: {
  repoName: string;
  config: Config;
}): OpenCodeConfig => ({
  agent: {
    build: {
      disable: true,
    },
    explore: {
      disable: true,
    },
    general: {
      disable: true,
    },
    plan: {
      disable: true,
    },
    ask: {
      disable: true,
    },
    docs: {
      prompt: getDocsAgentPrompt({
        repoName: args.repoName,
        repoPath: path.join(args.config.reposDirectory, args.repoName),
      }),
      disable: false,
      description:
        "Get answers about libraries and frameworks by searching their source code",
      permission: {
        webfetch: "deny",
        edit: "deny",
        bash: "allow",
        external_directory: "allow",
        doom_loop: "deny",
      },
      mode: "primary",
      tools: {
        write: false,
        bash: true,
        delete: false,
        read: true,
        grep: true,
        glob: true,
        list: true,
        path: false,
        todowrite: false,
        todoread: false,
        websearch: false,
      },
    },
  },
});

const onStartLoadConfig = Effect.gen(function* () {
  const configPath = expandHome(path.join(CONFIG_DIRECTORY, CONFIG_FILENAME));

  const configFile = Bun.file(configPath);

  const exists = yield* Effect.promise(() => configFile.exists());

  if (!exists) {
    yield* Effect.log(
      `Config file not found at ${configPath}, creating default config...`
    );
    yield* Effect.tryPromise({
      try: () => Bun.write(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2)),
      catch: (error) =>
        new ConfigError({
          message: "Failed to create default config",
          cause: error,
        }),
    });
    yield* Effect.log(`Default config created at ${configPath}`);
    return {
      ...DEFAULT_CONFIG,
      promptsDirectory: expandHome(DEFAULT_CONFIG.promptsDirectory),
      reposDirectory: expandHome(DEFAULT_CONFIG.reposDirectory),
    } satisfies Config;
  } else {
    return yield* Effect.tryPromise({
      try: () => configFile.json(),
      catch: (error) =>
        new ConfigError({
          message: "Failed to load config",
          cause: error,
        }),
    }).pipe(
      Effect.flatMap(Schema.decode(configSchema)),
      Effect.map((loadedConfig) => {
        return {
          ...loadedConfig,
          promptsDirectory: expandHome(loadedConfig.promptsDirectory),
          reposDirectory: expandHome(loadedConfig.reposDirectory),
        } satisfies Config;
      })
    );
  }
});

const configService = Effect.gen(function* () {
  const config = yield* onStartLoadConfig;

  const getRepo = ({
    repoName,
    config,
  }: {
    repoName: string;
    config: Config;
  }) =>
    Effect.gen(function* () {
      const repo = config.repos.find((repo) => repo.name === repoName);
      if (!repo) {
        return yield* Effect.fail(
          new ConfigError({ message: "Repo not found" })
        );
      }
      return repo;
    });

  return {
    cloneOrUpdateOneRepoLocally: (repoName: string) =>
      Effect.gen(function* () {
        const repo = yield* getRepo({ repoName, config });
        const repoDir = path.join(config.reposDirectory, repo.name);
        const branch = repo.branch ?? "main";

        const exists = yield* directoryExists(repoDir);
        if (exists) {
          yield* Effect.log(`Pulling latest changes for ${repo.name}...`);
          yield* pullRepo({ repoDir, branch });
        } else {
          yield* Effect.log(`Cloning ${repo.name}...`);
          yield* cloneRepo({ repoDir, url: repo.url, branch });
        }
        yield* Effect.log(`Done with ${repo.name}`);
        return repo;
      }),
    getOpenCodeConfig: (args: { repoName: string }) =>
      Effect.gen(function* () {
        const { repoName } = args;
        return OPENCODE_CONFIG({ repoName, config });
      }),
    rawConfig: () => Effect.succeed(config),
  };
});

export class ConfigService extends Effect.Service<ConfigService>()(
  "ConfigService",
  {
    effect: configService,
  }
) {}
