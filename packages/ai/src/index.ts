// AI provider configuration
export type AIProvider = 'openai' | 'anthropic' | 'gemini';

export interface AIConfig {
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

// Base AI request/response shapes
export interface AIRequest {
  prompt: string;
  config?: Partial<AIConfig>;
}

export interface AIResponse {
  content: string;
  tokensUsed: number;
  provider: AIProvider;
}

// Feature-level AI task types
export type AITaskType =
  | 'format'
  | 'summarize'
  | 'rephrase'
  | 'translate'
  | 'extract'
  | 'generate'
  | 'compare'
  | 'cite';

export interface AITask {
  type: AITaskType;
  input: string;
  options?: Record<string, unknown>;
}
