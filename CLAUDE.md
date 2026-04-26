# SharedMemory — Persistent Memory for AI Agents

You have access to SharedMemory via MCP tools. Use it to persist knowledge across sessions and recall past context.

## When to Remember (Proactively)

Store these automatically, without being asked:

- **Decisions**: Architecture choices, technology selections, trade-off resolutions ("Chose Postgres over MongoDB because...")
- **Project conventions**: Coding patterns, naming rules, folder structure, test practices
- **Bug fixes**: Root cause, investigation path, what was tried, and the solution
- **User preferences**: Editor settings, formatting style, communication preferences
- **Environment facts**: Deployment targets, CI/CD setup, credentials locations, URLs
- **Key learnings**: Gotchas, non-obvious behaviors, performance findings

## When to Recall (Before Acting)

Check memory before:

- Starting a new task → `query` with the task description to find relevant context
- Making architectural decisions → `query` for past decisions and conventions
- Debugging → `query` for similar past bugs and solutions
- Working with a specific file/module → `get_entity` for that component
- Starting a new session → `get_context` to load relevant project knowledge

## Tools Available

| Tool | When to Use |
|------|-------------|
| `remember` | Store a fact, decision, preference, or learning |
| `query` | Search for relevant memories by meaning |
| `batch_remember` | Store multiple related facts at once (up to 100) |
| `get_entity` | Get everything known about a person, project, file, or concept |
| `search_entities` | Find entities by name |
| `get_graph` | See the full knowledge graph for a volume |
| `get_context` | Get a formatted context block for the current task |
| `get_profile` | Get the auto-generated user profile |
| `get_memory` | Retrieve a specific memory by ID |
| `delete_memory` | Delete a memory |
| `update_memory` | Update a memory |
| `feedback` | Rate a memory's relevance (positive/negative) |
| `list_volumes` | List available memory volumes |
| `list_documents` | List uploaded documents |

## Best Practices

1. **Be specific** — "User prefers functional React components with TypeScript and Tailwind" beats "User likes React"
2. **Include context** — "Chose Redis for caching because Postgres was bottlenecking at 500 RPS on the /search endpoint" beats "Use Redis for caching"
3. **Use session scoping** — Pass `session_id` to group related memories within a work session
4. **Use agent scoping** — Pass `agent_id` to identify which agent stored what
5. **Remember at the end** — Before finishing a task, store a summary of what was done and why
6. **Remember failures too** — "Tried X but it failed because Y" prevents repeating mistakes
