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
    async requestGet(path, params) {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        const url = `${this.baseUrl}/agent${path}${qs}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        if (!res.ok) {
            const errorBody = await res.text();
            throw new Error(`SharedMemory API error ${res.status}: ${errorBody}`);
        }
        return res.json();
    }
    async requestDelete(path, params) {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        const url = `${this.baseUrl}/agent${path}${qs}`;
        const res = await fetch(url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${this.apiKey}` },
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
    async writeMemory(volumeId, content, memoryType, scope) {
        const body = {
            volume_id: volumeId,
            content,
            memory_type: memoryType || "factual",
        };
        if (scope?.user_id)
            body.user_id = scope.user_id;
        if (scope?.session_id)
            body.session_id = scope.session_id;
        if (scope?.agent_id)
            body.agent_id = scope.agent_id;
        if (scope?.app_id)
            body.app_id = scope.app_id;
        if (scope?.event_date)
            body.event_date = scope.event_date;
        if (scope?.metadata)
            body.metadata = scope.metadata;
        return this.request("POST", "/memory/write", body);
    }
    async queryMemory(volumeId, query, limit, scope) {
        const body = {
            volume_id: volumeId,
            query,
            limit: limit || 10,
        };
        if (scope?.user_id)
            body.user_id = scope.user_id;
        if (scope?.session_id)
            body.session_id = scope.session_id;
        if (scope?.agent_id)
            body.agent_id = scope.agent_id;
        if (scope?.app_id)
            body.app_id = scope.app_id;
        if (scope?.rerank)
            body.rerank = true;
        if (scope?.date_from)
            body.date_from = scope.date_from;
        if (scope?.date_to)
            body.date_to = scope.date_to;
        return this.request("POST", "/memory/query", body);
    }
    async deleteMemory(memoryId, volumeId) {
        return this.requestDelete(`/memory/${memoryId}`, { volume_id: volumeId });
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
    async getMemory(memoryId, volumeId) {
        return this.request("GET", `/memory/${memoryId}?volume_id=${encodeURIComponent(volumeId)}`);
    }
    async getProfile(volumeId, userId, refresh) {
        return this.request("POST", "/memory/profile", {
            volume_id: volumeId,
            ...(userId ? { user_id: userId } : {}),
            ...(refresh ? { refresh: true } : {}),
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
    // ─── Feedback ─────────────────────────────────────────
    async feedback(memoryId, volumeId, feedback, reason) {
        const body = {
            memory_id: memoryId,
            volume_id: volumeId,
            feedback,
        };
        if (reason)
            body.reason = reason;
        return this.request("POST", "/memory/feedback", body);
    }
    // ─── Instructions ─────────────────────────────────────
    async listInstructions(volumeId) {
        // Use search with filter to get all instructions for a volume
        const res = await this.request("POST", "/memory/query", {
            volume_id: volumeId,
            query: "instructions rules conventions preferences",
            limit: 50,
            filters: { memory_type: "instruction" },
        });
        return res?.results || [];
    }
}
exports.SharedMemoryClient = SharedMemoryClient;
//# sourceMappingURL=client.js.map