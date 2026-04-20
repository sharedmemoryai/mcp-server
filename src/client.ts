/**
 * SharedMemory API client — thin wrapper for the agent REST API.
 */
export class SharedMemoryClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async request(method: string, path: string, body?: any): Promise<any> {
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
  async listVolumes(): Promise<any[]> {
    return this.request("GET", "/volumes");
  }

  // ─── Memory ──────────────────────────────────────────
  async writeMemory(volumeId: string, content: string, memoryType?: string): Promise<any> {
    return this.request("POST", "/memory/write", {
      volume_id: volumeId,
      content,
      memory_type: memoryType || "factual",
    });
  }

  async queryMemory(volumeId: string, query: string, limit?: number): Promise<any> {
    return this.request("POST", "/memory/query", {
      volume_id: volumeId,
      query,
      limit: limit || 10,
    });
  }

  // ─── Entities & Graph ────────────────────────────────
  async getEntity(volumeId: string, entityName: string): Promise<any> {
    return this.request("POST", "/entity", {
      volume_id: volumeId,
      entity_name: entityName,
    });
  }

  async searchEntities(volumeId: string, query: string, limit?: number): Promise<any[]> {
    return this.request("POST", "/entities/search", {
      volume_id: volumeId,
      query,
      limit: limit || 20,
    });
  }

  async getGraph(volumeId: string, limit?: number): Promise<any> {
    return this.request("POST", "/graph", {
      volume_id: volumeId,
      limit: limit || 100,
    });
  }

  // ─── Batch Operations ────────────────────────────────
  async writeBatch(volumeId: string, memories: { content: string; memory_type?: string }[]): Promise<any> {
    return this.request("POST", "/memory/write/batch", {
      volume_id: volumeId,
      memories,
    });
  }

  async deleteBatch(volumeId: string, memoryIds: string[]): Promise<any> {
    return this.request("POST", "/memory/delete/batch", {
      volume_id: volumeId,
      memory_ids: memoryIds,
    });
  }

  async updateBatch(volumeId: string, updates: { memory_id: string; content: string }[]): Promise<any> {
    return this.request("POST", "/memory/update/batch", {
      volume_id: volumeId,
      updates,
    });
  }

  // ─── Profile & Context ────────────────────────────────
  async getMemory(memoryId: string): Promise<any> {
    return this.request("GET", `/memory/${memoryId}`);
  }

  async getProfile(volumeId: string, userId: string): Promise<any> {
    return this.request("POST", "/memory/profile", {
      volume_id: volumeId,
      user_id: userId,
    });
  }

  async getContext(volumeId: string, userId?: string, maxTokens?: number): Promise<any> {
    return this.request("POST", "/memory/context", {
      volume_id: volumeId,
      user_id: userId,
      max_tokens: maxTokens,
    });
  }

  // ─── Documents ────────────────────────────────────────
  async listDocuments(volumeId: string): Promise<any[]> {
    return this.request("GET", `/documents/${volumeId}`);
  }
}
