#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SharedMemoryClient } from "./client.js";

// ─── Config from env ────────────────────────────────────
const API_URL = process.env.SHAREDMEMORY_API_URL || "http://localhost:5000";
const API_KEY = process.env.SHAREDMEMORY_API_KEY || "";
const DEFAULT_VOLUME = process.env.SHAREDMEMORY_VOLUME_ID || "";

if (!API_KEY) {
  console.error("❌ SHAREDMEMORY_API_KEY is required. Set it in your MCP config.");
  process.exit(1);
}

const client = new SharedMemoryClient(API_URL, API_KEY);

// ─── Create MCP Server ─────────────────────────────────
const server = new McpServer({
  name: "SharedMemory",
  version: "1.0.0",
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
    memory_type: z.enum(["factual", "preference", "event", "relationship", "technical"]).optional()
      .describe("Type hint for the memory. Default: factual"),
  },
  async ({ content, volume_id, memory_type }) => {
    const vol = resolveVolume(volume_id);
    const result = await client.writeMemory(vol, content, memory_type);
    return {
      content: [
        {
          type: "text" as const,
          text: `✅ Memory stored.\n\n` +
            `**Decision:** ${result.decision || "approved"}\n` +
            `**Confidence:** ${result.confidence ?? "N/A"}\n` +
            (result.reason ? `**Reason:** ${result.reason}\n` : "") +
            (result.merged_content ? `**Merged with:** ${result.merged_content}\n` : "") +
            `**Memory ID:** ${result.memory_id}`,
        },
      ],
    };
  }
);

// ─── recall ─────────────────────────────────────────────
server.tool(
  "recall",
  "Search SharedMemory for relevant memories using semantic similarity. Returns matching memories from vector search + related knowledge graph facts.",
  {
    query: z.string().describe("What to search for in memory"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
    limit: z.number().min(1).max(50).optional().describe("Max results. Default: 10"),
  },
  async ({ query, volume_id, limit }) => {
    const vol = resolveVolume(volume_id);
    const result = await client.queryMemory(vol, query, limit);

    let text = `🔍 Found ${result.total_results} results for "${query}"\n\n`;

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

// ─── get_entity ─────────────────────────────────────────
server.tool(
  "get_entity",
  "Get everything SharedMemory knows about a specific entity (person, project, concept, etc). Returns the summary, all facts, and relationships.",
  {
    entity_name: z.string().describe("Name of the entity to look up (e.g., 'John Smith', 'React', 'Project Alpha')"),
    volume_id: z.string().optional().describe("Volume ID. Uses default if not set."),
  },
  async ({ entity_name, volume_id }) => {
    const vol = resolveVolume(volume_id);
    const entity = await client.getEntity(vol, entity_name);

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

// ─── explore_graph ──────────────────────────────────────
server.tool(
  "explore_graph",
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
  "List all memory volumes (spaces) this agent has access to. Each volume is an independent memory space.",
  {},
  async () => {
    const volumes = await client.listVolumes();

    if (volumes.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "No volumes found. This agent hasn't been connected to any volumes yet.\n" +
            "Ask the volume owner to connect this agent via the SharedMemory dashboard.",
        }],
      };
    }

    let text = `## Your Volumes (${volumes.length})\n\n`;
    volumes.forEach((v: any) => {
      text += `• **${v.name}** _(${v.type || "default"})_\n`;
      text += `  ID: \`${v.volume_id}\`\n`;
      text += `  Permissions: ${(v.permissions || []).join(", ")}\n\n`;
    });

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
