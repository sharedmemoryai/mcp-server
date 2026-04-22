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

  async requestGet(path: string, params?: Record<string, string>): Promise<any> {
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

  async requestDelete(path: string, params?: Record<string, string>): Promise<any> {
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
  async listVolumes(): Promise<any[]> {
    return this.request("GET", "/volumes");
  }

  // ─── Memory ──────────────────────────────────────────
  async writeMemory(volumeId: string, content: string, memoryType?: string, scope?: { user_id?: string; session_id?: string; agent_id?: string; app_id?: string; metadata?: Record<string, any> }): Promise<any> {
    const body: any = {
      volume_id: volumeId,
      content,
      memory_type: memoryType || "factual",
    };
    if (scope?.user_id) body.user_id = scope.user_id;
    if (scope?.session_id) body.session_id = scope.session_id;
    if (scope?.agent_id) body.agent_id = scope.agent_id;
    if (scope?.app_id) body.app_id = scope.app_id;
    if (scope?.metadata) body.metadata = scope.metadata;
    return this.request("POST", "/memory/write", body);
  }

  async queryMemory(volumeId: string, query: string, limit?: number, scope?: { user_id?: string; session_id?: string; agent_id?: string; app_id?: string; rerank?: boolean }): Promise<any> {
    const body: any = {
      volume_id: volumeId,
      query,
      limit: limit || 10,
    };
    if (scope?.user_id) body.user_id = scope.user_id;
    if (scope?.session_id) body.session_id = scope.session_id;
    if (scope?.agent_id) body.agent_id = scope.agent_id;
    if (scope?.app_id) body.app_id = scope.app_id;
    if (scope?.rerank) body.rerank = true;
    return this.request("POST", "/memory/query", body);
  }

  async deleteMemory(memoryId: string, volumeId: string): Promise<any> {
    return this.requestDelete(`/memory/${memoryId}`, { volume_id: volumeId });
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
  async getMemory(memoryId: string, volumeId: string): Promise<any> {
    return this.request("GET", `/memory/${memoryId}?volume_id=${encodeURIComponent(volumeId)}`);
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

  // ─── Instructions ─────────────────────────────────────
  async listInstructions(volumeId: string): Promise<any[]> {
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
