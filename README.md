# @sharedmemory/mcp-server

[Model Context Protocol](https://modelcontextprotocol.io) server for [SharedMemory](https://sharedmemory.ai). Gives Claude Code, Claude Desktop, Cursor, VS Code Copilot, and other MCP-compatible tools persistent memory.

## Quick Install (Recommended)

The fastest way to set up SharedMemory — one command, no JSON editing:

```bash
# Interactive — picks your client, asks for your API key
npx -y @sharedmemory/mcp-server install

# Or specify everything inline
npx -y @sharedmemory/mcp-server install --cursor --api-key sm_live_... --volume your-volume-id

# Install for all supported clients at once
npx -y @sharedmemory/mcp-server install --all --api-key sm_live_...
```

Supported clients: `--claude-code`, `--claude`, `--cursor`, `--vscode`, `--windsurf`, `--all`

## Manual Setup

If you prefer to edit config files yourself:

### Claude Code

One command:

```bash
claude mcp add sharedmemory -- npx -y @sharedmemory/mcp-server
```

Or with env vars:

```bash
claude mcp add --env SHAREDMEMORY_API_KEY=sm_live_... \
  --env SHAREDMEMORY_VOLUME_ID=your-volume-id \
  sharedmemory -- npx -y @sharedmemory/mcp-server
```

Or create `.mcp.json` in your project root to share with your team:

```json
{
  "mcpServers": {
    "sharedmemory": {
      "command": "npx",
      "args": ["-y", "@sharedmemory/mcp-server"],
      "env": {
        "SHAREDMEMORY_API_KEY": "${SHAREDMEMORY_API_KEY}",
        "SHAREDMEMORY_API_URL": "https://api.sharedmemory.ai",
        "SHAREDMEMORY_VOLUME_ID": "${SHAREDMEMORY_VOLUME_ID}"
      }
    }
  }
}
```

> **Tip:** Copy the included [`CLAUDE.md`](./CLAUDE.md) into your project root to teach Claude Code when and how to use SharedMemory proactively.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sharedmemory": {
      "command": "npx",
      "args": ["-y", "@sharedmemory/mcp-server"],
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
      "args": ["-y", "@sharedmemory/mcp-server"],
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
      "args": ["-y", "@sharedmemory/mcp-server"],
      "env": {
        "SHAREDMEMORY_API_KEY": "sm_live_...",
        "SHAREDMEMORY_API_URL": "https://api.sharedmemory.ai",
        "SHAREDMEMORY_VOLUME_ID": "your-volume-id"
      }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "sharedmemory": {
      "command": "npx",
      "args": ["-y", "@sharedmemory/mcp-server"],
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
| `recall` | Retrieve context BEFORE answering — semantic search over memories |
| `chat` | Get a pre-built LLM answer grounded in memories (use when user asks for memory summary) |
| `get_entity` | Get entity details and relationships |
| `search_entities` | Search entities by name |
| `explore_graph` | Knowledge graph overview |
| `list_volumes` | List accessible volumes |
| `manage_memory` | Update or delete a memory by ID |
| `batch_remember` | Store multiple memories at once |
| `get_memory` | Retrieve a specific memory by ID |
| `get_profile` | Auto-generated user profile from memories |
| `get_context` | Assemble a context block for LLM prompting |
| `set_instruction` | Store a persistent rule all agents will follow |
| `list_instructions` | List all active instructions for a volume |

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
