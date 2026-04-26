#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SharedMemoryClient } from "./client.js";
import { runInstall, printInstallHelp } from "./install.js";

// ─── CLI subcommands (before stdio server) ──────────────
const subcommand = process.argv[2];
if (subcommand === "install") {
  const rest = process.argv.slice(3);
  if (rest.includes("--help") || rest.includes("-h")) {
    printInstallHelp();
    process.exit(0);
  }
  runInstall(rest).then(() => process.exit(0)).catch((err) => {
    console.error("❌ Install failed:", err);
    process.exit(1);
  });
} else {

// ─── Config from env ────────────────────────────────────
const API_URL = process.env.SHAREDMEMORY_API_URL || "https://api.sharedmemory.ai";
const API_KEY = process.env.SHAREDMEMORY_API_KEY || "";  // sm_proj_rw_… or sm_agent_…
const DEFAULT_VOLUME = process.env.SHAREDMEMORY_VOLUME_ID || "";  // project ID

if (!API_KEY) {
  console.error("❌ SHAREDMEMORY_API_KEY is required. Set it in your MCP config.");
  process.exit(1);
}

const client = new SharedMemoryClient(API_URL, API_KEY);

// ─── Create MCP Server ─────────────────────────────────
const server = new McpServer({
  name: "SharedMemory",
  version: "2.2.1",
});

// ─── Helper: resolve volume_id ──────────────────────────
function resolveVolume(volumeId?: string): string {
  const v = volumeId || DEFAULT_VOLUME;
  if (!v) throw new Error("volume_id is required. Pass it or set SHAREDMEMORY_VOLUME_ID.");
  return v;
}

// ═══════════════════════════════════════════════════════
//  TOOLS
// ═══════════════════════════════════════════════════════

// ─── remember ───────────────────────────────────────────
server.tool(
  "remember",
  "Store a fact, note, or piece of information in SharedMemory. The memory pipeline will classify it, check for conflicts, extract knowledge, and build the graph automatically.",
  {
    content: z.string().describe("The fact, note, or information to remember"),
    volume_id: z.string().optional().describe("Volume (memory space) ID. Uses default if not set."),
    memory_type: z.enum(["factual", "preference", "event", "relationship", "technical", "episodic", "procedural", "instruction"]).optional()
      .describe("Type hint for the memory. Default: factual. Use 'instruction' for rules/conventions all agents should follow."),
    event_date: z.string().optional().describe("ISO date (YYYY-MM-DD or full ISO) of when the event occurred. Not when it's being stored."),
    user_id: z.string().optional().describe("Scope this memory to a specific user"),
    session_id: z.string().optional().describe("Scope this memory to a conversation session"),
    agent_id: z.string().optional().describe("Agent that created this memory"),
    app_id: z.string().optional().describe("App identifier for scoping"),
    metadata: z.record(z.string(), z.any()).optional().describe("Arbitrary key-value metadata to attach"),
  },
  async ({ content, volume_id, memory_type, event_date, user_id, session_id, agent_id, app_id, metadata }) => {
    const vol = resolveVolume(volume_id);
    const result = await client.writeMemory(vol, content, memory_type, { user_id, session_id, agent_id, app_id, event_date, metadata });
    return {
      content: [
        {
          type: "text" as const,
          text: `✅ Memory stored.\n\n` +
            `**Decision:** ${result.status || "approved"}\n` +
            `**Confidence:** ${result.confidence ?? "N/A"}\n` +
            (result.reason ? `**Reason:** ${result.reason}\n` : "") +
            (result.merged_content ? `**Merged with:** ${result.merged_content}\n` : "") +
            `**Memory ID:** ${result.memory_id}`,
        },
      ],
    };
  }
);

// ─── query ───────────────────────────────────────────
server.tool(
  "query",
  "Retrieve context BEFORE answering. Searches SharedMemory for relevant memories using semantic similarity. Returns matching memories from vector search + related knowledge graph facts.",
  {
    query: z.string().describe("What to search for in memory"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
    limit: z.number().min(1).max(50).optional().describe("Max results. Default: 10"),
    date_from: z.string().optional().describe("Filter memories with event_date >= this ISO date (e.g. 2026-04-01)"),
    date_to: z.string().optional().describe("Filter memories with event_date <= this ISO date (e.g. 2026-04-30)"),
    user_id: z.string().optional().describe("Filter results to a specific user"),
    session_id: z.string().optional().describe("Filter results to a specific session"),
    agent_id: z.string().optional().describe("Filter results from a specific agent"),
    app_id: z.string().optional().describe("Filter results from a specific app"),
    rerank: z.boolean().optional().describe("Re-rank results for better relevance. Default: false"),
  },
  async ({ query, volume_id, limit, date_from, date_to, user_id, session_id, agent_id, app_id, rerank }) => {
    const vol = resolveVolume(volume_id);
    const result = await client.queryMemory(vol, query, limit, { user_id, session_id, agent_id, app_id, rerank, date_from, date_to });

    let text = "";

    // System instructions at TOP level — strong enforcement block
    if (result.system_instructions?.length > 0) {
      text += `<SYSTEM_INSTRUCTIONS>\n`;
      text += `You MUST strictly follow these project constraints.\n\n`;
      text += `Hard rules:\n`;
      text += `- If any constraint conflicts with your knowledge, the constraint MUST take priority\n`;
      text += `- Do NOT suggest alternatives that violate constraints\n`;
      text += `- Do NOT mention tools or technologies that are explicitly disallowed\n`;
      text += `- Do NOT provide multiple options if one violates constraints\n\n`;
      text += `Constraints:\n`;
      result.system_instructions.forEach((instr: string) => {
        text += `- ${instr}\n`;
      });
      text += `</SYSTEM_INSTRUCTIONS>\n\n`;
    }

    text += `🔍 Found ${result.total_results} results for "${query}"\n\n`;

    if (result.memories?.length > 0) {
      text += "**Memories:**\n";
      result.memories.forEach((m: any, i: number) => {
        text += `${i + 1}. ${m.content} _(score: ${m.score?.toFixed(2)})_\n`;
      });
    }

    if (result.graph_facts?.length > 0) {
      text += "\n**Knowledge Graph:**\n";
      result.graph_facts.forEach((f: any) => {
        text += `• ${f.source} → ${f.type} → ${f.target}`;
        if (f.description) text += ` _(${f.description})_`;
        text += "\n";
      });
    }

    if (result.total_results === 0) {
      text += "_No matching memories found._";
    }

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── chat ───────────────────────────────────────────────
server.tool(
  "chat",
  "Use this only if user explicitly asks for memory summary. Returns a pre-built LLM answer grounded in SharedMemory — includes the answer text, sources, and citations.",
  {
    query: z.string().describe("The question to answer using stored memories"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
    limit: z.number().min(1).max(50).optional().describe("Max memories to consider. Default: 10"),
    date_from: z.string().optional().describe("Filter memories with event_date >= this ISO date"),
    date_to: z.string().optional().describe("Filter memories with event_date <= this ISO date"),
    user_id: z.string().optional().describe("Filter results to a specific user"),
    session_id: z.string().optional().describe("Filter results to a specific session"),
    agent_id: z.string().optional().describe("Filter results from a specific agent"),
    app_id: z.string().optional().describe("Filter results from a specific app"),
  },
  async ({ query, volume_id, limit, date_from, date_to, user_id, session_id, agent_id, app_id }) => {
    const vol = resolveVolume(volume_id);
    const result = await client.chatMemory(vol, query, limit, { user_id, session_id, agent_id, app_id, date_from, date_to });

    let text = "";

    if (result.answer) {
      text += `${result.answer}\n\n`;
    }

    if (result.sources?.length > 0) {
      text += `---\n**Sources (${result.sources.length}):**\n`;
      result.sources.forEach((s: any, i: number) => {
        text += `${i + 1}. ${s.content?.substring(0, 120)}${s.content?.length > 120 ? "…" : ""} _(score: ${s.score?.toFixed(2)})_\n`;
      });
    }

    if (result.citations?.length > 0) {
      text += `\n**Citations:** ${result.citations.length} references\n`;
    }

    if (!result.answer && !result.sources?.length) {
      text = `_No matching memories found for "${query}"._`;
    }

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── get_entity ─────────────────────────────────────────
server.tool(
  "get_entity",
  "Get everything SharedMemory knows about a specific entity (person, project, concept, etc). Returns the summary, all facts, and relationships.",
  {
    name: z.string().describe("Name of the entity to look up (e.g., 'John Smith', 'React', 'Project Alpha')"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
  },
  async ({ name, volume_id }) => {
    const vol = resolveVolume(volume_id);
    const entity = await client.getEntity(vol, name);

    let text = `## ${entity.name}\n`;
    text += `**Type:** ${entity.type}\n\n`;

    if (entity.summary) {
      text += `**Summary:** ${entity.summary}\n\n`;
    }

    if (entity.facts?.length > 0) {
      text += `**Facts (${entity.facts.length}):**\n`;
      entity.facts.forEach((f: any) => {
        const imp = f.importance >= 0.8 ? " ★" : "";
        text += `• [${f.category}] ${f.content}${imp}\n`;
      });
      text += "\n";
    }

    if (entity.relationships?.length > 0) {
      text += `**Relationships (${entity.relationships.length}):**\n`;
      entity.relationships.forEach((r: any) => {
        const arrow = r.direction === "outgoing" ? "→" : "←";
        text += `• ${arrow} ${r.rel_type?.replace(/_/g, " ")} ${r.name} _(${r.type})_\n`;
      });
    }

    if (entity.summaries?.length > 1) {
      text += `\n**Summary versions:** ${entity.summaries.length}\n`;
    }

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── search_entities ────────────────────────────────────
server.tool(
  "search_entities",
  "Search for entities in the knowledge graph by name. Useful for finding people, projects, concepts, etc.",
  {
    query: z.string().describe("Search term (matched against entity names)"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
    limit: z.number().min(1).max(50).optional().describe("Max results. Default: 20"),
  },
  async ({ query, volume_id, limit }) => {
    const vol = resolveVolume(volume_id);
    const entities = await client.searchEntities(vol, query, limit);

    if (entities.length === 0) {
      return { content: [{ type: "text" as const, text: `No entities matching "${query}" found.` }] };
    }

    let text = `🔍 Found ${entities.length} entities matching "${query}":\n\n`;
    entities.forEach((e: any) => {
      text += `• **${e.name}** _(${e.type})_ — ${e.factCount} facts`;
      if (e.summary) text += `\n  ${e.summary}`;
      text += "\n";
    });

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── get_graph ──────────────────────────────────────────
server.tool(
  "get_graph",
  "Get an overview of the entire knowledge graph for a volume. Shows all entities and their relationships — like a map of everything SharedMemory knows.",
  {
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
    limit: z.number().min(1).max(200).optional().describe("Max entities to return. Default: 50"),
  },
  async ({ volume_id, limit }) => {
    const vol = resolveVolume(volume_id);
    const graph = await client.getGraph(vol, limit || 50);

    let text = `## Knowledge Graph Overview\n\n`;
    text += `**${graph.entities?.length || 0} entities** · **${graph.relationships?.length || 0} relationships**\n\n`;

    if (graph.entities?.length > 0) {
      // Group by type
      const byType: Record<string, any[]> = {};
      graph.entities.forEach((e: any) => {
        const type = e.type || "other";
        if (!byType[type]) byType[type] = [];
        byType[type].push(e);
      });

      for (const [type, ents] of Object.entries(byType)) {
        text += `### ${type.charAt(0).toUpperCase() + type.slice(1)} (${ents.length})\n`;
        ents.forEach((e: any) => {
          text += `• **${e.name}** — ${e.factCount} facts`;
          if (e.summary) text += ` — _${e.summary}_`;
          text += "\n";
        });
        text += "\n";
      }
    }

    if (graph.relationships?.length > 0) {
      text += `### Key Relationships\n`;
      graph.relationships.slice(0, 30).forEach((r: any) => {
        text += `• ${r.source} → **${r.type?.replace(/_/g, " ")}** → ${r.target}`;
        if (r.description) text += ` _(${r.description})_`;
        text += "\n";
      });
    }

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── list_volumes ───────────────────────────────────────
server.tool(
  "list_volumes",
  "List all memory volumes (projects) this API key has access to. Each volume is an independent memory space.",
  {},
  async () => {
    const volumes = await client.listVolumes();

    if (volumes.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "No volumes found. This API key hasn't been connected to any projects yet.\n" +
            "Ask the project owner to create one in the SharedMemory dashboard.",
        }],
      };
    }

    let text = `## Your Projects (${volumes.length})\n\n`;
    volumes.forEach((v: any) => {
      text += `• **${v.name}** _(${v.type || "default"})_\n`;
      text += `  ID: \`${v.volume_id}\`\n`;
      text += `  Permissions: ${(v.permissions || []).join(", ")}\n\n`;
    });

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── delete_memory ──────────────────────────────────────
server.tool(
  "delete_memory",
  "Delete an existing memory by ID.",
  {
    memory_id: z.string().describe("The UUID of the memory to delete"),
    volume_id: z.string().optional().describe("Volume (project) ID. Uses default if not set."),
  },
  async ({ memory_id, volume_id }) => {
    const vol = resolveVolume(volume_id);
    await client.deleteMemory(memory_id, vol);
    return { content: [{ type: "text" as const, text: `🗑️ Memory ${memory_id} deleted.` }] };
  }
);

// ─── update_memory ──────────────────────────────────────
server.tool(
  "update_memory",
  "Update the content of an existing memory by ID.",
  {
    memory_id: z.string().describe("The UUID of the memory to update"),
    content: z.string().describe("New content for the memory"),
    volume_id: z.string().optional().describe("Volume (project) ID. Uses default if not set."),
  },
  async ({ memory_id, content, volume_id }) => {
    const vol = resolveVolume(volume_id);
    await client.request("PATCH", `/memory/${memory_id}`, { volume_id: vol, content });
    return { content: [{ type: "text" as const, text: `✏️ Memory ${memory_id} updated.\n**New content:** ${content}` }] };
  }
);

// ─── feedback ───────────────────────────────────────────
server.tool(
  "feedback",
  "Submit feedback on a memory's relevance. Helps improve future recall quality.",
  {
    memory_id: z.string().describe("The UUID of the memory to rate"),
    feedback: z.enum(["positive", "negative"]).describe("Whether the memory was relevant/helpful"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
    reason: z.string().optional().describe("Optional reason for the feedback"),
  },
  async ({ memory_id, feedback, volume_id, reason }) => {
    const vol = resolveVolume(volume_id);
    await client.feedback(memory_id, vol, feedback, reason);
    const emoji = feedback === "positive" ? "👍" : "👎";
    return { content: [{ type: "text" as const, text: `${emoji} Feedback recorded for memory ${memory_id}.` }] };
  }
);

// ─── batch_remember ─────────────────────────────────────
server.tool(
  "batch_remember",
  "Store multiple facts or pieces of information at once. More efficient than calling remember() in a loop.",
  {
    memories: z.array(z.object({
      content: z.string().describe("The fact, note, or information to remember"),
      memory_type: z.enum(["factual", "preference", "event", "relationship", "technical", "episodic", "procedural", "instruction"]).optional()
        .describe("Type hint for the memory. Default: factual"),
    })).min(1).max(100).describe("Array of memories to store"),
    volume_id: z.string().optional().describe("Volume (memory space) ID. Uses default if not set."),
    user_id: z.string().optional().describe("Scope all memories to a specific user"),
    session_id: z.string().optional().describe("Scope all memories to a conversation session"),
    agent_id: z.string().optional().describe("Agent that created these memories"),
    app_id: z.string().optional().describe("App identifier for scoping"),
  },
  async ({ memories, volume_id, user_id, session_id, agent_id, app_id }) => {
    const vol = resolveVolume(volume_id);
    const scopedMemories = memories.map(m => {
      const item: any = { ...m };
      if (user_id) item.user_id = user_id;
      if (session_id) item.session_id = session_id;
      if (agent_id) item.agent_id = agent_id;
      if (app_id) item.app_id = app_id;
      return item;
    });
    const result = await client.writeBatch(vol, scopedMemories);

    let text = `✅ Batch write complete.\n\n`;
    text += `**Total:** ${result.total} · **Succeeded:** ${result.succeeded} · **Failed:** ${result.failed}\n`;

    if (result.failed > 0 && result.results) {
      const failures = result.results.filter((r: any) => r.error);
      text += "\n**Failures:**\n";
      failures.forEach((f: any) => {
        text += `• Item ${f.index}: ${f.error}\n`;
      });
    }

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── get_memory ─────────────────────────────────────────
server.tool(
  "get_memory",
  "Retrieve a specific memory by its ID. Useful for viewing the full details of a memory found via recall.",
  {
    memory_id: z.string().describe("The UUID of the memory to retrieve"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
  },
  async ({ memory_id, volume_id }) => {
    const vol = resolveVolume(volume_id);
    const memory = await client.getMemory(memory_id, vol);

    let text = `## Memory ${memory_id}\n\n`;
    text += `**Content:** ${memory.content}\n`;
    text += `**Type:** ${memory.memory_type || "factual"}\n`;
    if (memory.created_at) text += `**Created:** ${memory.created_at}\n`;
    if (memory.agent) text += `**Agent:** ${memory.agent}\n`;
    if (memory.metadata) text += `**Metadata:** ${JSON.stringify(memory.metadata)}\n`;

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── get_profile ────────────────────────────────────────
server.tool(
  "get_profile",
  "Get a comprehensive profile for a volume or user. Returns categorized facts (identity, preferences, expertise, projects), relationships, recent activity, instructions, topics, stats, and a pre-formatted context_block for LLM injection.",
  {
    user_id: z.string().optional().describe("Optional user ID to scope the profile to a specific user"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
    refresh: z.boolean().optional().describe("Force refresh (bypass 5-min cache)"),
  },
  async ({ user_id, volume_id, refresh }) => {
    const vol = resolveVolume(volume_id);
    const profile = await client.getProfile(vol, user_id, refresh);

    let text = `## Profile${profile.user_id ? `: ${profile.user_id}` : ""}\n\n`;
    if (profile.summary) text += `${profile.summary}\n\n`;

    if (profile.identity?.length > 0) {
      text += "**Identity:**\n";
      profile.identity.forEach((f: string) => { text += `• ${f}\n`; });
      text += "\n";
    }

    if (profile.preferences?.length > 0) {
      text += "**Preferences:**\n";
      profile.preferences.forEach((p: string) => { text += `• ${p}\n`; });
      text += "\n";
    }

    if (profile.expertise?.length > 0) {
      text += "**Expertise:**\n";
      profile.expertise.forEach((e: string) => { text += `• ${e}\n`; });
      text += "\n";
    }

    if (profile.projects?.length > 0) {
      text += "**Projects:**\n";
      profile.projects.forEach((p: string) => { text += `• ${p}\n`; });
      text += "\n";
    }

    if (profile.recent_activity?.length > 0) {
      text += "**Recent Activity:**\n";
      profile.recent_activity.forEach((a: string) => { text += `• ${a}\n`; });
      text += "\n";
    }

    if (profile.relationships?.length > 0) {
      text += "**Relationships:**\n";
      profile.relationships.forEach((r: any) => {
        text += `• ${r.entity} (${r.type})${r.description ? `: ${r.description}` : ""}\n`;
      });
      text += "\n";
    }

    if (profile.topics?.length > 0) {
      text += "**Topics:**\n";
      profile.topics.slice(0, 10).forEach((t: any) => { text += `• ${t.name} (${t.fact_count} facts)\n`; });
      text += "\n";
    }

    const s = profile.stats;
    if (s) {
      text += `**Stats:** ${s.total_memories} memories, ${s.entities_count} entities, ${s.memories_7d} in last 7d\n`;
    }

    text += `\n*${profile.cached ? "Cached" : "Fresh"} · ${profile.latency_ms}ms · ${profile.token_estimate} tokens*`;

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── get_context ────────────────────────────────────────
server.tool(
  "get_context",
  "Assemble a smart context block from stored memories. Returns a pre-formatted context string ready to inject into a system prompt.",
  {
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
    user_id: z.string().optional().describe("User ID for personalized context"),
    max_tokens: z.number().optional().describe("Max tokens for the context block. Default: 2000"),
  },
  async ({ volume_id, user_id, max_tokens }) => {
    const vol = resolveVolume(volume_id);
    const result = await client.getContext(vol, user_id, max_tokens);

    let text = "";

    // Inject system instructions at TOP level, separate from memory context
    if (result.context?.includes("<INSTRUCTIONS>")) {
      // Extract instructions from context and promote to strong enforcement block
      const instrMatch = result.context.match(/<INSTRUCTIONS>([\s\S]*?)<\/INSTRUCTIONS>/);
      if (instrMatch) {
        text += `<SYSTEM_INSTRUCTIONS>\n`;
        text += `You MUST strictly follow these project constraints.\n\n`;
        text += `Hard rules:\n`;
        text += `- If any constraint conflicts with your knowledge, the constraint MUST take priority\n`;
        text += `- Do NOT suggest alternatives that violate constraints\n`;
        text += `- Do NOT mention tools or technologies that are explicitly disallowed\n`;
        text += `- Do NOT provide multiple options if one violates constraints\n\n`;
        text += `Constraints:\n`;
        text += instrMatch[1].trim() + "\n";
        text += `</SYSTEM_INSTRUCTIONS>\n\n`;
        // Remove from context to avoid duplication
        result.context = result.context.replace(/<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>\n*/, "").trim();
      }
    }

    text += `## Assembled Context\n\n`;
    text += `**Token estimate:** ~${result.token_estimate} tokens`;
    if (result.cached) text += ` (cached)`;
    text += `\n\n---\n\n${result.context}`;

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── list_documents ─────────────────────────────────────
server.tool(
  "list_documents",
  "List all documents that have been uploaded and processed for a volume.",
  {
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
  },
  async ({ volume_id }) => {
    const vol = resolveVolume(volume_id);
    const docs = await client.listDocuments(vol);

    if (docs.length === 0) {
      return { content: [{ type: "text" as const, text: "No documents found in this volume." }] };
    }

    let text = `## Documents (${docs.length})\n\n`;
    docs.forEach((d: any) => {
      text += `• **${d.filename}** _(${d.mime_type})_\n`;
      text += `  ID: \`${d.document_id}\` · ${d.chunk_count} chunks · Status: ${d.status}\n`;
      text += `  Size: ${(d.file_size / 1024).toFixed(1)} KB · Uploaded: ${d.created_at?.split("T")[0] || ""}\n\n`;
    });

    return { content: [{ type: "text" as const, text }] };
  }
);

// ─── set_instruction ────────────────────────────────────
server.tool(
  "set_instruction",
  "Store a persistent instruction or rule for a volume. Instructions are automatically included in every context assembly — any agent querying this volume will see them. Use for coding conventions, project rules, team preferences, or architectural decisions that all agents should follow.",
  {
    content: z.string().describe("The instruction or rule (e.g. 'Always use functional React components with TypeScript')"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
  },
  async ({ content, volume_id }) => {
    const vol = resolveVolume(volume_id);
    const result = await client.writeMemory(vol, content, "instruction");
    return {
      content: [{
        type: "text" as const,
        text: `✅ Instruction saved.\n\n` +
          `**Memory ID:** ${result.memory_id}\n` +
          `This instruction will be automatically included in context for all agents on this volume.`,
      }],
    };
  }
);

// ─── list_instructions ──────────────────────────────────
server.tool(
  "list_instructions",
  "List all active instructions/rules for a volume. These are automatically included in every context assembly.",
  {
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
  },
  async ({ volume_id }) => {
    const vol = resolveVolume(volume_id);
    const results = await client.listInstructions(vol);

    if (!results || results.length === 0) {
      return { content: [{ type: "text" as const, text: "No instructions set for this volume." }] };
    }

    let text = `## Instructions (${results.length})\n\n`;
    results.forEach((r: any, i: number) => {
      const content = r.payload?.content || r.content || "";
      const id = r.payload?.memory_id || r.memory_id || "";
      text += `${i + 1}. ${content}\n   _ID: \`${id}\`_\n\n`;
    });
    text += `_Use \`delete_memory\` to delete an instruction by ID._`;

    return { content: [{ type: "text" as const, text }] };
  }
);

// ═══════════════════════════════════════════════════════
//  RESOURCES
// ═══════════════════════════════════════════════════════

server.resource(
  "graph-overview",
  "memory://graph",
  async (uri) => {
    if (!DEFAULT_VOLUME) {
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain", text: "Set SHAREDMEMORY_VOLUME_ID to view graph." }],
      };
    }
    const graph = await client.getGraph(DEFAULT_VOLUME, 50);
    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(graph, null, 2),
      }],
    };
  }
);

// ═══════════════════════════════════════════════════════
//  PROMPTS
// ═══════════════════════════════════════════════════════

server.prompt(
  "summarize-knowledge",
  "Get a natural language summary of everything in a volume's knowledge graph",
  { volume_id: z.string().optional().describe("Volume ID. Uses default if not set.") },
  async ({ volume_id }) => {
    const vol = resolveVolume(volume_id);
    const graph = await client.getGraph(vol, 100);

    let context = "Here is the complete knowledge graph:\n\n";
    context += "ENTITIES:\n";
    graph.entities?.forEach((e: any) => {
      context += `- ${e.name} (${e.type}): ${e.summary || `${e.factCount} facts`}\n`;
    });
    context += "\nRELATIONSHIPS:\n";
    graph.relationships?.forEach((r: any) => {
      context += `- ${r.source} → ${r.type} → ${r.target}: ${r.description || ""}\n`;
    });

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${context}\n\nPlease provide a comprehensive, well-structured summary of all the knowledge stored in this memory space. Organize it by topic and highlight the most important facts and relationships.`,
          },
        },
      ],
    };
  }
);

server.prompt(
  "what-do-you-know-about",
  "Ask what SharedMemory knows about a specific topic",
  {
    topic: z.string().describe("The topic to ask about"),
    volume_id: z.string().optional().describe("Volume ID"),
  },
  async ({ topic, volume_id }) => {
    const vol = resolveVolume(volume_id);

    // Search entities
    let context = "";
    try {
      const entities = await client.searchEntities(vol, topic, 5);
      if (entities.length > 0) {
        context += "MATCHING ENTITIES:\n";
        for (const e of entities) {
          context += `- ${(e as any).name} (${(e as any).type}): ${(e as any).summary || ""}\n`;
          // Get full details for top match
          if (e === entities[0]) {
            try {
              const full = await client.getEntity(vol, (e as any).name);
              if (full.facts?.length > 0) {
                context += "  Facts:\n";
                full.facts.forEach((f: any) => { context += `    • ${f.content}\n`; });
              }
              if (full.relationships?.length > 0) {
                context += "  Relationships:\n";
                full.relationships.forEach((r: any) => {
                  context += `    • ${r.direction === "outgoing" ? "→" : "←"} ${r.rel_type} ${r.name}\n`;
                });
              }
            } catch { /* entity detail failed, skip */ }
          }
        }
      }
    } catch { /* search failed */ }

    // Also do memory search
    try {
      const memories = await client.queryMemory(vol, topic, 5);
      if (memories.memories?.length > 0) {
        context += "\nRELATED MEMORIES:\n";
        memories.memories.forEach((m: any) => {
          context += `- ${m.content}\n`;
        });
      }
      if (memories.graph_facts?.length > 0) {
        context += "\nGRAPH FACTS:\n";
        memories.graph_facts.forEach((f: any) => {
          context += `- ${f.source} → ${f.type} → ${f.target}\n`;
        });
      }
    } catch { /* query failed */ }

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: context
              ? `Here is everything SharedMemory knows about "${topic}":\n\n${context}\n\nPlease synthesize this into a clear, helpful answer about "${topic}".`
              : `SharedMemory doesn't have any stored knowledge about "${topic}" yet. Let the user know and ask if they'd like to store some information about it.`,
          },
        },
      ],
    };
  }
);

// ═══════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🧠 SharedMemory MCP server running on stdio");
}

main().catch((err) => {
  console.error("❌ MCP server failed:", err);
  process.exit(1);
});

} // end else (not "install" subcommand)
