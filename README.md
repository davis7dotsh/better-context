# The Better Context App

Get up to date information about any technology from it's actual source code.

```
bun add -g btca@latest
```

```
btca ask -t svelte -q "How does the inspect rune work?"
```

### I HIGHLY RECOMMEND CHANGING THE MODEL AND PROVIDER IN THE CONFIG FILE

_big pickle is surprisingly good, but there are better models out there_

**Out of the box, this uses big pickle from OpenCode because it's free, but if you have opencode installed you can [customize the model and provider in the config file](https://opencode.ai/docs/models) at ~/.config/btca/btca.json.**

I am mostly using haiku 4.5...

```json
{
  "promptsDirectory": "~/.config/btca/prompts",
  "reposDirectory": "~/.config/btca/repos",
  "port": 3420,
  "maxInstances": 5,
  "repos": [
    {
      "name": "svelte",
      "url": "https://github.com/sveltejs/svelte.dev",
      "branch": "main"
    },
    {
      "name": "effect",
      "url": "https://github.com/Effect-TS/effect",
      "branch": "main"
    },
    {
      "name": "nextjs",
      "url": "https://github.com/vercel/next.js",
      "branch": "canary"
    }
  ],
  "model": "claude-haiku-4-5",
  "provider": "anthropic"
}
```

The config is also where you can add in your open repos to the app so you can ask questions about them.

The way it works is the "name" is the key for that piece of tech. Say you want to ask questions about svelte, you can do the following:

1. Chat with an opencode instance that has the svelte repo in context:

```
btca chat -t svelte
```

2. Ask a question in the cli (great for agents):

```
btca ask -t svelte -q "How does the inspect rune work?"
```

3. Start a web server and send your questions there:

```
btca serve
```

Then hit http://locahost:8080/question as a post request and this body:

```json
{
  "question": "how does the query remote function work in sveltekit?",
  "tech": "svelte"
}
```

_better docs, agent setup, and more coming soon!_
