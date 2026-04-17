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
    return this.request("POST", "/memory/propose", {
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
}
