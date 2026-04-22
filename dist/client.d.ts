/**
 * SharedMemory API client — thin wrapper for the agent REST API.
 */
export declare class SharedMemoryClient {
    private baseUrl;
    private apiKey;
    constructor(baseUrl: string, apiKey: string);
    request(method: string, path: string, body?: any): Promise<any>;
    listVolumes(): Promise<any[]>;
    writeMemory(volumeId: string, content: string, memoryType?: string): Promise<any>;
    queryMemory(volumeId: string, query: string, limit?: number): Promise<any>;
    getEntity(volumeId: string, entityName: string): Promise<any>;
    searchEntities(volumeId: string, query: string, limit?: number): Promise<any[]>;
    getGraph(volumeId: string, limit?: number): Promise<any>;
    writeBatch(volumeId: string, memories: {
        content: string;
        memory_type?: string;
    }[]): Promise<any>;
    deleteBatch(volumeId: string, memoryIds: string[]): Promise<any>;
    updateBatch(volumeId: string, updates: {
        memory_id: string;
        content: string;
    }[]): Promise<any>;
    getMemory(memoryId: string): Promise<any>;
    getProfile(volumeId: string, userId: string): Promise<any>;
    getContext(volumeId: string, userId?: string, maxTokens?: number): Promise<any>;
    listDocuments(volumeId: string): Promise<any[]>;
}
