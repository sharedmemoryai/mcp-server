/**
 * SharedMemory API client — thin wrapper for the agent REST API.
 */
export declare class SharedMemoryClient {
    private baseUrl;
    private apiKey;
    constructor(baseUrl: string, apiKey: string);
    request(method: string, path: string, body?: any): Promise<any>;
    requestGet(path: string, params?: Record<string, string>): Promise<any>;
    requestDelete(path: string, params?: Record<string, string>): Promise<any>;
    listVolumes(): Promise<any[]>;
    writeMemory(volumeId: string, content: string, memoryType?: string, scope?: {
        user_id?: string;
        session_id?: string;
        agent_id?: string;
        app_id?: string;
        event_date?: string;
        metadata?: Record<string, any>;
    }): Promise<any>;
    queryMemory(volumeId: string, query: string, limit?: number, scope?: {
        user_id?: string;
        session_id?: string;
        agent_id?: string;
        app_id?: string;
        rerank?: boolean;
        date_from?: string;
        date_to?: string;
    }): Promise<any>;
    deleteMemory(memoryId: string, volumeId: string): Promise<any>;
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
    getMemory(memoryId: string, volumeId: string): Promise<any>;
    getProfile(volumeId: string, userId?: string, refresh?: boolean): Promise<any>;
    getContext(volumeId: string, userId?: string, maxTokens?: number): Promise<any>;
    listDocuments(volumeId: string): Promise<any[]>;
    feedback(memoryId: string, volumeId: string, feedback: string, reason?: string): Promise<any>;
    listInstructions(volumeId: string): Promise<any[]>;
}
