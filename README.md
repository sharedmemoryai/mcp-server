# @sharedmemory/mcp-server

[Model Context Protocol](https://modelcontextprotocol.io) server for [SharedMemory](https://sharedmemory.ai) — give Claude, Cursor, Windsurf, and VS Code persistent memory.

## Setup

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sharedmemory": {
      "command": "npx",
      "args": ["@sharedmemory/mcp-server"],
      "env": {
        "SHAREDMEMORY_API_KEY": "sm_live_...",
        "SHAREDMEMORY_API_URL": "https://api.sharedmemory.ai",
        "SHAREDMEMORY_VOLUME_ID": "your-volume-id"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "sharedmemory": {
      "command": "npx",
      "args": ["@sharedmemory/mcp-server"],
      "env": {
        "SHAREDMEMORY_API_KEY": "sm_live_...",
        "SHAREDMEMORY_API_URL": "https://api.sharedmemory.ai",
        "SHAREDMEMORY_VOLUME_ID": "your-volume-id"
      }
    }
  }
}
```

### VS Code Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "sharedmemory": {
      "command": "npx",
      "args": ["@sharedmemory/mcp-server"],
      "env": {
        "SHAREDMEMORY_API_KEY": "sm_live_...",
        "SHAREDMEMORY_API_URL": "https://api.sharedmemory.ai",
        "SHAREDMEMORY_VOLUME_ID": "your-volume-id"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHAREDMEMORY_API_KEY` | Yes | Agent API key (`sm_live_...`) |
| `SHAREDMEMORY_API_URL` | No | API base URL (default: `http://localhost:5000`) |
| `SHAREDMEMORY_VOLUME_ID` | No | Default volume ID |

## Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a fact or note in memory |
| `recall` | Search memories by semantic similarity |
| `get_entity` | Get entity details (facts, relationships) |
| `search_entities` | Search entities by name |
| `explore_graph` | Overview of the full knowledge graph |
| `list_volumes` | List accessible volumes |

## Resources

| URI | Description |
|-----|-------------|
| `memory://graph` | Knowledge graph JSON for the default volume |

## Prompts

| Prompt | Description |
|--------|-------------|
| `summarize-knowledge` | Summary of all knowledge in a volume |
| `what-do-you-know-about` | Everything known about a topic |

## Usage

Once configured, just talk naturally:

> "Remember that our quarterly meeting is March 15th"
> "What do you know about the React migration?"
> "Who works on the backend team?"

## Docs

Full documentation: [docs.sharedmemory.ai/sdks/mcp-server](https://docs.sharedmemory.ai/sdks/mcp-server)

## License

MIT
