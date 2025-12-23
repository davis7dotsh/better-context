# btca

A CLI tool for asking questions about technologies using their source code repositories.

## Installation

```bash
bun install
```

## Usage

```bash
bun run src/index.ts
```

Or after building:

```bash
btca <command>
```

## Commands

### `btca`

Show version information.

### `btca ask`

Ask a question about a technology.

```bash
btca ask -t <tech> -q <question>
btca ask --tech svelte --question "How do I create a reactive store?"
```

Options:

- `-t, --tech` - The technology/repo to query
- `-q, --question` - The question to ask

### `btca chat`

Start an interactive TUI chat session.

```bash
btca chat -t <tech>
btca chat --tech nextjs
```

Options:

- `-t, --tech` - The technology/repo to chat about

### `btca serve`

Start an HTTP server to answer questions via API.

```bash
btca serve
btca serve -p 3000
```

Options:

- `-p, --port` - Port to listen on (default: 8080)

Endpoint:

- `POST /question` - Send `{ "tech": "svelte", "question": "..." }` to get answers

### `btca open`

Hold an OpenCode instance in the background for faster subsequent queries.

```bash
btca open
```

### `btca config`

Manage CLI configuration. Shows the config file path when run without subcommands.

```bash
btca config
```

#### `btca config model`

View or set the model and provider.

```bash
# View current model/provider
btca config model

# Set model and provider
btca config model -p <provider> -m <model>
btca config model --provider anthropic --model claude-3-opus
```

Options:

- `-p, --provider` - The provider to use
- `-m, --model` - The model to use

Both options must be specified together when updating.

#### `btca config repos list`

List all configured repositories.

```bash
btca config repos list
```

#### `btca config repos add`

Add a new repository to the configuration.

```bash
btca config repos add -n <name> -u <url> [-b <branch>] [--notes <notes>]
btca config repos add --name react --url https://github.com/facebook/react --branch main
```

Options:

- `-n, --name` - Unique name for the repo (required)
- `-u, --url` - Git repository URL (required)
- `-b, --branch` - Branch to use (default: "main")
- `--notes` - Special instructions for the AI when using this repo

## Configuration

Configuration is stored at `~/.config/btca/btca.json`. The config file includes:

- `promptsDirectory` - Directory for system prompts
- `reposDirectory` - Directory where repos are cloned
- `port` - Default server port
- `maxInstances` - Maximum concurrent OpenCode instances
- `repos` - Array of configured repositories
- `model` - AI model to use
- `provider` - AI provider to use

## Core Primitives

BTCA is built around five core primitives that work together to provide context-aware AI assistance.

### Resource

A **resource** is a source of context that can be searched by an agent. Resources are cached locally and can be one of several types:

| Type    | Description                          | Example                           |
| ------- | ------------------------------------ | --------------------------------- |
| `git`   | A git repository cloned locally      | `svelte`, `effect`, `tailwindcss` |
| `local` | A local directory on your filesystem | `/Users/you/projects/my-app`      |

_Future types: `url` (scraped docs), `npm` (extracted packages)_

Resources are defined in your config and cached to `~/.local/share/btca/resources/`.

### Collection

A **collection** is an assembled group of resources in a single directory that an agent can search. Collections are created on-demand using symlinks to cached resources.

- Collections are **derived** from resource names, not user-defined
- The collection key is the sorted, `+`-joined resource names: `effect+svelte`
- Single-resource collections are valid: `svelte`
- Collections live at `~/.local/share/btca/collections/{key}/`

```
collections/
  effect+svelte/
    effect -> ../../resources/effect
    svelte -> ../../resources/svelte
```

### Agent

An **agent** is an OpenCode instance with its working directory set to a collection. The agent can search, read, and analyze all files within the collection.

- Agents are read-only (no write/bash/edit tools)
- Each agent operates on exactly one collection
- Multiple agents can run concurrently on different ports

### Thread

A **thread** is a conversation consisting of one or more questions. Threads persist to SQLite and maintain conversational context.

### Question

A **question** is a single exchange within a thread. Each question has:

| Field       | Description                                           |
| ----------- | ----------------------------------------------------- |
| `resources` | Resources added **by this question** (not inherited)  |
| `prompt`    | The user's question text                              |
| `answer`    | The agent's response                                  |
| `provider`  | AI provider at ask time                               |
| `model`     | AI model at ask time                                  |
| `metadata`  | Files read, searches performed, token usage, duration |

### Config

The **config** stores application settings:

- Resource definitions (git repos, local dirs)
- Default model and provider
- Data directory paths

Stored at `~/.config/btca/config.json`.

---

## How It All Works Together

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User asks a question                         │
│            "how do I use $state in @svelte with @effect?"           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. Parse resources from @mentions                                   │
│     → resources for this question: ["svelte", "effect"]             │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. Compute full resource list (accumulate from thread history)      │
│     → previous questions added: []                                   │
│     → full resources: ["effect", "svelte"]                          │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Ensure collection exists                                         │
│     → key: "effect+svelte"                                          │
│     → ensure resources are cached (git clone/pull)                  │
│     → create collection dir with symlinks                           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. Build context prompt                                             │
│     → include previous Q&A from thread (as text)                    │
│     → include collection info                                       │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. Spawn agent (OpenCode instance) in collection directory          │
│     → cwd: ~/.local/share/btca/collections/effect+svelte            │
│     → agent searches files, reads docs, formulates answer           │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6. Capture response + metadata                                      │
│     → stream answer to user                                         │
│     → record files read, searches, tokens, duration                 │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  7. Persist question to thread                                       │
│     → save to SQLite for conversation continuity                    │
│     → next question inherits resources ["effect", "svelte"]         │
└─────────────────────────────────────────────────────────────────────┘
```

### Resource Accumulation Example

```
Thread: "Learning Svelte + Effect"

Q1: "how do I use $state in @svelte?"
    → resources: ["svelte"]
    → collection: "svelte"
    → agent searches svelte docs

Q2: "how can I integrate @effect with this?"
    → resources: ["effect"]  (only new ones)
    → inherited: ["svelte"]
    → full: ["effect", "svelte"]
    → collection: "effect+svelte"
    → agent searches both, sees Q1 context

Q3: "show me an example combining both"
    → resources: []  (none new)
    → inherited: ["effect", "svelte"]
    → collection: "effect+svelte"
    → agent has full context from Q1 + Q2
```

### Directory Structure

```
~/.local/share/btca/
├── resources/              # Cached resources
│   ├── svelte/             # Git clone
│   ├── effect/             # Git clone
│   └── my-project/         # Symlink to local dir
├── collections/            # Assembled collections
│   ├── svelte/
│   │   └── svelte -> ../resources/svelte
│   └── effect+svelte/
│       ├── effect -> ../resources/effect
│       └── svelte -> ../resources/svelte
└── btca.db                 # SQLite (threads, questions)

~/.config/btca/
└── config.json             # User configuration
```

---

## Future: Cloud Sandboxes

The architecture is designed to support cloud sandboxes (e.g., Daytona) in the future.

### Session = Sandbox Model

Each thread maps 1:1 to a cloud sandbox:

```
Thread 1 → Sandbox A
├── User asks about @svelte     → Clone svelte (slow first time)
├── User asks follow-up         → Sandbox already has svelte (instant)
├── User adds @effect           → Clone effect, svelte cached
├── Sandbox hibernates after inactivity

Thread 1 resumed later:
├── Wake sandbox A              → Resources still cached
├── Continue conversation       → Fast
```

**Benefits:**

- First question with new resources is slow, but follow-ups are fast
- Resources accumulate within the sandbox (no re-cloning)
- Natural mapping: Thread ↔ Sandbox is 1:1
- Sandbox can hibernate to reduce costs, wake on resume

**Thread schema extension for cloud:**

```typescript
interface Thread {
	// ... existing fields
	sandbox?: {
		id: string; // Daytona workspace ID
		status: 'running' | 'hibernated' | 'terminated';
		cachedResources: string[]; // What's already cloned
		lastActiveAt: Date;
	};
}
```

**Future optimizations:**

- Warm pool of sandboxes with popular resource combinations
- Route new threads to best-match sandbox
- Pre-warm based on usage patterns
