#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const client_js_1 = require("./client.js");
const install_js_1 = require("./install.js");
// ─── CLI subcommands (before stdio server) ──────────────
const subcommand = process.argv[2];
if (subcommand === "install") {
    const rest = process.argv.slice(3);
    if (rest.includes("--help") || rest.includes("-h")) {
        (0, install_js_1.printInstallHelp)();
        process.exit(0);
    }
    (0, install_js_1.runInstall)(rest).then(() => process.exit(0)).catch((err) => {
        console.error("❌ Install failed:", err);
        process.exit(1);
    });
}
else {
    // ─── Config from env ────────────────────────────────────
    const API_URL = process.env.SHAREDMEMORY_API_URL || "https://api.sharedmemory.ai";
    const API_KEY = process.env.SHAREDMEMORY_API_KEY || ""; // sm_proj_rw_… or sm_agent_…
    const DEFAULT_VOLUME = process.env.SHAREDMEMORY_VOLUME_ID || ""; // project ID
    if (!API_KEY) {
        console.error("❌ SHAREDMEMORY_API_KEY is required. Set it in your MCP config.");
        process.exit(1);
    }
    const client = new client_js_1.SharedMemoryClient(API_URL, API_KEY);
    // ─── Create MCP Server ─────────────────────────────────
    const server = new mcp_js_1.McpServer({
        name: "SharedMemory",
        version: "2.1.0",
    });
    // ─── Helper: resolve volume_id ──────────────────────────
    function resolveVolume(volumeId) {
        const v = volumeId || DEFAULT_VOLUME;
        if (!v)
            throw new Error("volume_id is required. Pass it or set SHAREDMEMORY_VOLUME_ID.");
        return v;
    }
    // ═══════════════════════════════════════════════════════
    //  TOOLS
    // ═══════════════════════════════════════════════════════
    // ─── remember ───────────────────────────────────────────
    server.tool("remember", "Store a fact, note, or piece of information in SharedMemory. The memory pipeline will classify it, check for conflicts, extract knowledge, and build the graph automatically.", {
        content: zod_1.z.string().describe("The fact, note, or information to remember"),
        volume_id: zod_1.z.string().optional().describe("Volume (memory space) ID. Uses default if not set."),
        memory_type: zod_1.z.enum(["factual", "preference", "event", "relationship", "technical"]).optional()
            .describe("Type hint for the memory. Default: factual"),
    }, async ({ content, volume_id, memory_type }) => {
        const vol = resolveVolume(volume_id);
        const result = await client.writeMemory(vol, content, memory_type);
        return {
            content: [
                {
                    type: "text",
                    text: `✅ Memory stored.\n\n` +
                        `**Decision:** ${result.decision || "approved"}\n` +
                        `**Confidence:** ${result.confidence ?? "N/A"}\n` +
                        (result.reason ? `**Reason:** ${result.reason}\n` : "") +
                        (result.merged_content ? `**Merged with:** ${result.merged_content}\n` : "") +
                        `**Memory ID:** ${result.memory_id}`,
                },
            ],
        };
    });
    // ─── recall ─────────────────────────────────────────────
    server.tool("recall", "Search SharedMemory for relevant memories using semantic similarity. Returns matching memories from vector search + related knowledge graph facts.", {
        query: zod_1.z.string().describe("What to search for in memory"),
        volume_id: zod_1.z.string().optional().describe("Volume ID. Uses default if not set."),
        limit: zod_1.z.number().min(1).max(50).optional().describe("Max results. Default: 10"),
    }, async ({ query, volume_id, limit }) => {
        const vol = resolveVolume(volume_id);
        const result = await client.queryMemory(vol, query, limit);
        let text = `🔍 Found ${result.total_results} results for "${query}"\n\n`;
        if (result.memories?.length > 0) {
            text += "**Memories:**\n";
            result.memories.forEach((m, i) => {
                text += `${i + 1}. ${m.content} _(score: ${m.score?.toFixed(2)})_\n`;
            });
        }
        if (result.graph_facts?.length > 0) {
            text += "\n**Knowledge Graph:**\n";
            result.graph_facts.forEach((f) => {
                text += `• ${f.source} → ${f.type} → ${f.target}`;
                if (f.description)
                    text += ` _(${f.description})_`;
                text += "\n";
            });
        }
        if (result.total_results === 0) {
            text += "_No matching memories found._";
        }
        return { content: [{ type: "text", text }] };
    });
    // ─── get_entity ─────────────────────────────────────────
    server.tool("get_entity", "Get everything SharedMemory knows about a specific entity (person, project, concept, etc). Returns the summary, all facts, and relationships.", {
        entity_name: zod_1.z.string().describe("Name of the entity to look up (e.g., 'John Smith', 'React', 'Project Alpha')"),
        volume_id: zod_1.z.string().optional().describe("Volume ID. Uses default if not set."),
    }, async ({ entity_name, volume_id }) => {
        const vol = resolveVolume(volume_id);
        const entity = await client.getEntity(vol, entity_name);
        let text = `## ${entity.name}\n`;
        text += `**Type:** ${entity.type}\n\n`;
        if (entity.summary) {
            text += `**Summary:** ${entity.summary}\n\n`;
        }
        if (entity.facts?.length > 0) {
            text += `**Facts (${entity.facts.length}):**\n`;
            entity.facts.forEach((f) => {
                const imp = f.importance >= 0.8 ? " ★" : "";
                text += `• [${f.category}] ${f.content}${imp}\n`;
            });
            text += "\n";
        }
        if (entity.relationships?.length > 0) {
            text += `**Relationships (${entity.relationships.length}):**\n`;
            entity.relationships.forEach((r) => {
                const arrow = r.direction === "outgoing" ? "→" : "←";
                text += `• ${arrow} ${r.rel_type?.replace(/_/g, " ")} ${r.name} _(${r.type})_\n`;
            });
        }
        if (entity.summaries?.length > 1) {
            text += `\n**Summary versions:** ${entity.summaries.length}\n`;
        }
        return { content: [{ type: "text", text }] };
    });
    // ─── search_entities ────────────────────────────────────
    server.tool("search_entities", "Search for entities in the knowledge graph by name. Useful for finding people, projects, concepts, etc.", {
        query: zod_1.z.string().describe("Search term (matched against entity names)"),
        volume_id: zod_1.z.string().optional().describe("Volume ID. Uses default if not set."),
        limit: zod_1.z.number().min(1).max(50).optional().describe("Max results. Default: 20"),
    }, async ({ query, volume_id, limit }) => {
        const vol = resolveVolume(volume_id);
        const entities = await client.searchEntities(vol, query, limit);
        if (entities.length === 0) {
            return { content: [{ type: "text", text: `No entities matching "${query}" found.` }] };
        }
        let text = `🔍 Found ${entities.length} entities matching "${query}":\n\n`;
        entities.forEach((e) => {
            text += `• **${e.name}** _(${e.type})_ — ${e.factCount} facts`;
            if (e.summary)
                text += `\n  ${e.summary}`;
            text += "\n";
        });
        return { content: [{ type: "text", text }] };
    });
    // ─── explore_graph ──────────────────────────────────────
    server.tool("explore_graph", "Get an overview of the entire knowledge graph for a volume. Shows all entities and their relationships — like a map of everything SharedMemory knows.", {
        volume_id: zod_1.z.string().optional().describe("Volume ID. Uses default if not set."),
        limit: zod_1.z.number().min(1).max(200).optional().describe("Max entities to return. Default: 50"),
    }, async ({ volume_id, limit }) => {
        const vol = resolveVolume(volume_id);
        const graph = await client.getGraph(vol, limit || 50);
        let text = `## Knowledge Graph Overview\n\n`;
        text += `**${graph.entities?.length || 0} entities** · **${graph.relationships?.length || 0} relationships**\n\n`;
        if (graph.entities?.length > 0) {
            // Group by type
            const byType = {};
            graph.entities.forEach((e) => {
                const type = e.type || "other";
                if (!byType[type])
                    byType[type] = [];
                byType[type].push(e);
            });
            for (const [type, ents] of Object.entries(byType)) {
                text += `### ${type.charAt(0).toUpperCase() + type.slice(1)} (${ents.length})\n`;
                ents.forEach((e) => {
                    text += `• **${e.name}** — ${e.factCount} facts`;
                    if (e.summary)
                        text += ` — _${e.summary}_`;
                    text += "\n";
                });
                text += "\n";
            }
        }
        if (graph.relationships?.length > 0) {
            text += `### Key Relationships\n`;
            graph.relationships.slice(0, 30).forEach((r) => {
                text += `• ${r.source} → **${r.type?.replace(/_/g, " ")}** → ${r.target}`;
                if (r.description)
                    text += ` _(${r.description})_`;
                text += "\n";
            });
        }
        return { content: [{ type: "text", text }] };
    });
    // ─── list_volumes ───────────────────────────────────────
    server.tool("list_volumes", "List all memory volumes (projects) this API key has access to. Each volume is an independent memory space.", {}, async () => {
        const volumes = await client.listVolumes();
        if (volumes.length === 0) {
            return {
                content: [{
                        type: "text",
                        text: "No volumes found. This API key hasn't been connected to any projects yet.\n" +
                            "Ask the project owner to create one in the SharedMemory dashboard.",
                    }],
            };
        }
        let text = `## Your Projects (${volumes.length})\n\n`;
        volumes.forEach((v) => {
            text += `• **${v.name}** _(${v.type || "default"})_\n`;
            text += `  ID: \`${v.volume_id}\`\n`;
            text += `  Permissions: ${(v.permissions || []).join(", ")}\n\n`;
        });
        return { content: [{ type: "text", text }] };
    });
    // ─── manage_memory ──────────────────────────────────────
    server.tool("manage_memory", "Delete or update an existing memory by ID.", {
        action: zod_1.z.enum(["delete", "update"]).describe("Action to take on the memory"),
        memory_id: zod_1.z.string().describe("The UUID of the memory to manage"),
        volume_id: zod_1.z.string().optional().describe("Volume (project) ID. Uses default if not set."),
        content: zod_1.z.string().optional().describe("New content (only for update action)"),
    }, async ({ action, memory_id, volume_id, content }) => {
        const vol = resolveVolume(volume_id);
        if (action === "delete") {
            await client.request("DELETE", `/memory/${memory_id}`, { volume_id: vol });
            return { content: [{ type: "text", text: `🗑️ Memory ${memory_id} deleted.` }] };
        }
        if (action === "update" && content) {
            const result = await client.request("PATCH", `/memory/${memory_id}`, { volume_id: vol, content });
            return { content: [{ type: "text", text: `✏️ Memory ${memory_id} updated.\n**New content:** ${content}` }] };
        }
        return { content: [{ type: "text", text: "Invalid action or missing content for update." }] };
    });
    // ─── batch_remember ─────────────────────────────────────
    server.tool("batch_remember", "Store multiple facts or pieces of information at once. More efficient than calling remember() in a loop.", {
        memories: zod_1.z.array(zod_1.z.object({
            content: zod_1.z.string().describe("The fact, note, or information to remember"),
            memory_type: zod_1.z.enum(["factual", "preference", "event", "relationship", "technical"]).optional()
                .describe("Type hint for the memory. Default: factual"),
        })).min(1).max(100).describe("Array of memories to store"),
        volume_id: zod_1.z.string().optional().describe("Volume (memory space) ID. Uses default if not set."),
    }, async ({ memories, volume_id }) => {
        const vol = resolveVolume(volume_id);
        const result = await client.writeBatch(vol, memories);
        let text = `✅ Batch write complete.\n\n`;
        text += `**Total:** ${result.total} · **Succeeded:** ${result.succeeded} · **Failed:** ${result.failed}\n`;
        if (result.failed > 0 && result.results) {
            const failures = result.results.filter((r) => r.error);
            text += "\n**Failures:**\n";
            failures.forEach((f) => {
                text += `• Item ${f.index}: ${f.error}\n`;
            });
        }
        return { content: [{ type: "text", text }] };
    });
    // ─── get_memory ─────────────────────────────────────────
    server.tool("get_memory", "Retrieve a specific memory by its ID. Useful for viewing the full details of a memory found via recall.", {
        memory_id: zod_1.z.string().describe("The UUID of the memory to retrieve"),
    }, async ({ memory_id }) => {
        const memory = await client.getMemory(memory_id);
        let text = `## Memory ${memory_id}\n\n`;
        text += `**Content:** ${memory.content}\n`;
        text += `**Type:** ${memory.memory_type || "factual"}\n`;
        if (memory.created_at)
            text += `**Created:** ${memory.created_at}\n`;
        if (memory.agent)
            text += `**Agent:** ${memory.agent}\n`;
        if (memory.metadata)
            text += `**Metadata:** ${JSON.stringify(memory.metadata)}\n`;
        return { content: [{ type: "text", text }] };
    });
    // ─── get_profile ────────────────────────────────────────
    server.tool("get_profile", "Get an auto-generated profile for a user based on their stored memories. Returns stable facts, recent activity, relationships, and a summary.", {
        user_id: zod_1.z.string().describe("The user ID to generate a profile for"),
        volume_id: zod_1.z.string().optional().describe("Volume ID. Uses default if not set."),
    }, async ({ user_id, volume_id }) => {
        const vol = resolveVolume(volume_id);
        const profile = await client.getProfile(vol, user_id);
        let text = `## Profile: ${profile.user_id}\n\n`;
        if (profile.summary)
            text += `${profile.summary}\n\n`;
        if (profile.static?.length > 0) {
            text += "**Core Facts:**\n";
            profile.static.forEach((f) => { text += `• ${f}\n`; });
            text += "\n";
        }
        if (profile.dynamic?.length > 0) {
            text += "**Recent Activity:**\n";
            profile.dynamic.forEach((a) => { text += `• ${a}\n`; });
            text += "\n";
        }
        if (profile.relationships?.length > 0) {
            text += "**Relationships:**\n";
            profile.relationships.forEach((r) => {
                text += `• ${r.type} → ${r.entity}\n`;
            });
        }
        return { content: [{ type: "text", text }] };
    });
    // ─── get_context ────────────────────────────────────────
    server.tool("get_context", "Assemble a smart context block from stored memories. Returns a pre-formatted context string ready to inject into a system prompt.", {
        volume_id: zod_1.z.string().optional().describe("Volume ID. Uses default if not set."),
        user_id: zod_1.z.string().optional().describe("User ID for personalized context"),
        max_tokens: zod_1.z.number().optional().describe("Max tokens for the context block. Default: 2000"),
    }, async ({ volume_id, user_id, max_tokens }) => {
        const vol = resolveVolume(volume_id);
        const result = await client.getContext(vol, user_id, max_tokens);
        let text = `## Assembled Context\n\n`;
        text += `**Token estimate:** ~${result.token_estimate} tokens`;
        if (result.cached)
            text += ` (cached)`;
        text += `\n\n---\n\n${result.context}`;
        return { content: [{ type: "text", text }] };
    });
    // ─── list_documents ─────────────────────────────────────
    server.tool("list_documents", "List all documents that have been uploaded and processed for a volume.", {
        volume_id: zod_1.z.string().optional().describe("Volume ID. Uses default if not set."),
    }, async ({ volume_id }) => {
        const vol = resolveVolume(volume_id);
        const docs = await client.listDocuments(vol);
        if (docs.length === 0) {
            return { content: [{ type: "text", text: "No documents found in this volume." }] };
        }
        let text = `## Documents (${docs.length})\n\n`;
        docs.forEach((d) => {
            text += `• **${d.filename}** _(${d.mime_type})_\n`;
            text += `  ID: \`${d.document_id}\` · ${d.chunk_count} chunks · Status: ${d.status}\n`;
            text += `  Size: ${(d.file_size / 1024).toFixed(1)} KB · Uploaded: ${d.created_at?.split("T")[0] || ""}\n\n`;
        });
        return { content: [{ type: "text", text }] };
    });
    // ═══════════════════════════════════════════════════════
    //  RESOURCES
    // ═══════════════════════════════════════════════════════
    server.resource("graph-overview", "memory://graph", async (uri) => {
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
    });
    // ═══════════════════════════════════════════════════════
    //  PROMPTS
    // ═══════════════════════════════════════════════════════
    server.prompt("summarize-knowledge", "Get a natural language summary of everything in a volume's knowledge graph", { volume_id: zod_1.z.string().optional().describe("Volume ID. Uses default if not set.") }, async ({ volume_id }) => {
        const vol = resolveVolume(volume_id);
        const graph = await client.getGraph(vol, 100);
        let context = "Here is the complete knowledge graph:\n\n";
        context += "ENTITIES:\n";
        graph.entities?.forEach((e) => {
            context += `- ${e.name} (${e.type}): ${e.summary || `${e.factCount} facts`}\n`;
        });
        context += "\nRELATIONSHIPS:\n";
        graph.relationships?.forEach((r) => {
            context += `- ${r.source} → ${r.type} → ${r.target}: ${r.description || ""}\n`;
        });
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `${context}\n\nPlease provide a comprehensive, well-structured summary of all the knowledge stored in this memory space. Organize it by topic and highlight the most important facts and relationships.`,
                    },
                },
            ],
        };
    });
    server.prompt("what-do-you-know-about", "Ask what SharedMemory knows about a specific topic", {
        topic: zod_1.z.string().describe("The topic to ask about"),
        volume_id: zod_1.z.string().optional().describe("Volume ID"),
    }, async ({ topic, volume_id }) => {
        const vol = resolveVolume(volume_id);
        // Search entities
        let context = "";
        try {
            const entities = await client.searchEntities(vol, topic, 5);
            if (entities.length > 0) {
                context += "MATCHING ENTITIES:\n";
                for (const e of entities) {
                    context += `- ${e.name} (${e.type}): ${e.summary || ""}\n`;
                    // Get full details for top match
                    if (e === entities[0]) {
                        try {
                            const full = await client.getEntity(vol, e.name);
                            if (full.facts?.length > 0) {
                                context += "  Facts:\n";
                                full.facts.forEach((f) => { context += `    • ${f.content}\n`; });
                            }
                            if (full.relationships?.length > 0) {
                                context += "  Relationships:\n";
                                full.relationships.forEach((r) => {
                                    context += `    • ${r.direction === "outgoing" ? "→" : "←"} ${r.rel_type} ${r.name}\n`;
                                });
                            }
                        }
                        catch { /* entity detail failed, skip */ }
                    }
                }
            }
        }
        catch { /* search failed */ }
        // Also do memory search
        try {
            const memories = await client.queryMemory(vol, topic, 5);
            if (memories.memories?.length > 0) {
                context += "\nRELATED MEMORIES:\n";
                memories.memories.forEach((m) => {
                    context += `- ${m.content}\n`;
                });
            }
            if (memories.graph_facts?.length > 0) {
                context += "\nGRAPH FACTS:\n";
                memories.graph_facts.forEach((f) => {
                    context += `- ${f.source} → ${f.type} → ${f.target}\n`;
                });
            }
        }
        catch { /* query failed */ }
        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: context
                            ? `Here is everything SharedMemory knows about "${topic}":\n\n${context}\n\nPlease synthesize this into a clear, helpful answer about "${topic}".`
                            : `SharedMemory doesn't have any stored knowledge about "${topic}" yet. Let the user know and ask if they'd like to store some information about it.`,
                    },
                },
            ],
        };
    });
    // ═══════════════════════════════════════════════════════
    //  START
    // ═══════════════════════════════════════════════════════
    async function main() {
        const transport = new stdio_js_1.StdioServerTransport();
        await server.connect(transport);
        console.error("🧠 SharedMemory MCP server running on stdio");
    }
    main().catch((err) => {
        console.error("❌ MCP server failed:", err);
        process.exit(1);
    });
} // end else (not "install" subcommand)
//# sourceMappingURL=index.js.map