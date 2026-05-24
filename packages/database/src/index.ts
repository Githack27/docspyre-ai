// Database configuration and interface declarations
export interface DbConfig {
  url: string;
  maxConnections?: number;
}

export interface DatabaseService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T>(queryText: string, params?: unknown[]): Promise<T[]>;
}

// Simple in-memory mock store for client-side/tauri local execution
export class MemoryDatabase implements DatabaseService {
  private connected = false;
  private store: Record<string, Record<string, unknown>> = {};

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query<T>(queryText: string, _params?: unknown[]): Promise<T[]> {
    if (!this.connected) {
      throw new Error("Database not connected");
    }
    // Mock querying logic
    return [] as T[];
  }
}
