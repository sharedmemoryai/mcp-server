"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedMemoryClient = void 0;
/**
 * SharedMemory API client — thin wrapper for the agent REST API.
 */
class SharedMemoryClient {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.apiKey = apiKey;
    }
    async request(method, path, body) {
        const url = `${this.baseUrl}/agent${path}`;
        const res = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`SharedMemory API error ${res.status}: ${errorBody}`);
        }
        return res.json();
    }
    // ─── Volumes ─────────────────────────────────────────
    async listVolumes() {
        return this.request("GET", "/volumes");
    }
    // ─── Memory ──────────────────────────────────────────
    async writeMemory(volumeId, content, memoryType) {
        return this.request("POST", "/memory/write", {
            volume_id: volumeId,
            content,
            memory_type: memoryType || "factual",
        });
    }
    async queryMemory(volumeId, query, limit) {
        return this.request("POST", "/memory/query", {
            volume_id: volumeId,
            query,
            limit: limit || 10,
        });
    }
    // ─── Entities & Graph ────────────────────────────────
    async getEntity(volumeId, entityName) {
        return this.request("POST", "/entity", {
            volume_id: volumeId,
            entity_name: entityName,
        });
    }
    async searchEntities(volumeId, query, limit) {
        return this.request("POST", "/entities/search", {
            volume_id: volumeId,
            query,
            limit: limit || 20,
        });
    }
    async getGraph(volumeId, limit) {
        return this.request("POST", "/graph", {
            volume_id: volumeId,
            limit: limit || 100,
        });
    }
    // ─── Batch Operations ────────────────────────────────
    async writeBatch(volumeId, memories) {
        return this.request("POST", "/memory/write/batch", {
            volume_id: volumeId,
            memories,
        });
    }
    async deleteBatch(volumeId, memoryIds) {
        return this.request("POST", "/memory/delete/batch", {
            volume_id: volumeId,
            memory_ids: memoryIds,
        });
    }
    async updateBatch(volumeId, updates) {
        return this.request("POST", "/memory/update/batch", {
            volume_id: volumeId,
            updates,
        });
    }
    // ─── Profile & Context ────────────────────────────────
    async getMemory(memoryId) {
        return this.request("GET", `/memory/${memoryId}`);
    }
    async getProfile(volumeId, userId) {
        return this.request("POST", "/memory/profile", {
            volume_id: volumeId,
            user_id: userId,
        });
    }
    async getContext(volumeId, userId, maxTokens) {
        return this.request("POST", "/memory/context", {
            volume_id: volumeId,
            user_id: userId,
            max_tokens: maxTokens,
        });
    }
    // ─── Documents ────────────────────────────────────────
    async listDocuments(volumeId) {
        return this.request("GET", `/documents/${volumeId}`);
    }
}
exports.SharedMemoryClient = SharedMemoryClient;
//# sourceMappingURL=client.js.map