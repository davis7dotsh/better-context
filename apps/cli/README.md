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

# the core primitives of the better context app

- "resource" - an instance of context that can be used to answer questions. Can be a git repo, a local directory, a url, or an npm package
- "collection" - a group of resources in one place (directory) that an agent can use to answer questions
- "agent" - an instance of open code (perhaps will be custom later) that has a collection loaded into it
- "question" - a one off question for an agent to answer. this contains the question, the collection, and the answer
- "thread" - a conversation between a user and an agent. this contains the collection and the back and forth between the user and agent
- "config" - the application config. where collections go, where agents go, the selected model and provider, etc.
