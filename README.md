# @sharedmemory/mcp-server

[Model Context Protocol](https://modelcontextprotocol.io) server for [SharedMemory](https://sharedmemory.ai). Gives Claude, Cursor, VS Code Copilot, and other MCP-compatible tools persistent memory.

## Setup

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

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

`.cursor/mcp.json` in your project root:

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

`.vscode/mcp.json`:

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

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHAREDMEMORY_API_KEY` | Yes | — | Agent API key |
| `SHAREDMEMORY_API_URL` | No | `https://api.sharedmemory.ai` | API endpoint |
| `SHAREDMEMORY_VOLUME_ID` | No | — | Default volume |

## Available tools

| Tool | Description |
|------|-------------|
| `remember` | Store a fact or note |
| `recall` | Semantic search over memories |
| `get_entity` | Get entity details and relationships |
| `search_entities` | Search entities by name |
| `explore_graph` | Knowledge graph overview |
| `list_volumes` | List accessible volumes |

## Resources

| URI | Description |
|-----|-------------|
| `memory://graph` | Knowledge graph for the default volume |

## Prompts

| Name | Description |
|------|-------------|
| `summarize-knowledge` | Summarize all knowledge in a volume |
| `what-do-you-know-about` | Retrieve everything known about a topic |

## Documentation

https://docs.sharedmemory.ai/sdks/mcp-server

## License

MIT
