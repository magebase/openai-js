/**
 * SKEW SDK Types
 */

/**
 * SDK configuration
 */
export interface SkewConfig {
  /** SKEW API key */
  apiKey: string;

  /** Organization ID (auto-detected from key if not provided) */
  orgId?: string;

  /** Project ID for grouping requests */
  projectId?: string;

  /** Telemetry configuration */
  telemetry?: Partial<TelemetryConfig>;

  /** Proxy configuration */
  proxy?: Partial<ProxyConfig>;
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  /** Enable telemetry (default: true) */
  enabled: boolean;

  /** Include raw prompts in telemetry (default: false for privacy) */
  includePrompts: boolean;

  /** Include raw responses in telemetry (default: false for privacy) */
  includeResponses: boolean;

  /** Sample rate 0-1 (default: 1.0 = all requests) */
  sampleRate: number;

  /** Batch size before flush (default: 10) */
  batchSize: number;

  /** Flush interval in ms (default: 5000) */
  flushIntervalMs: number;

  /** Telemetry endpoint */
  endpoint: string;
}

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  /** Enable proxy routing (default: false) */
  enabled: boolean;

  /** Fail open on proxy errors (default: true) */
  failOpen: boolean;

  /** Proxy base URL */
  baseUrl: string;

  /** Request timeout in ms (default: 30000) */
  timeoutMs: number;
}

/**
 * Telemetry payload
 */
export interface TelemetryPayload {
  request: TelemetryRequest;
  response: TelemetryResponse;
  context: TelemetryContext;
}

export interface TelemetryRequest {
  requestId: string;
  orgId: string;
  projectId?: string;
  endpoint: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  timestampStart: string;
}

export interface TelemetryResponse {
  timestampEnd: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costEstimateUsd: number;
  latencyMs: number;
  errorClass?: string;
  errorMessage?: string;
}

export interface TelemetryContext {
  callLineageId?: string;
  sdkLanguage: string;
  sdkVersion: string;
  openaiClientVersion: string;
  promptHash?: string;
}

/**
 * Wrapper interface
 */
export interface SkewWrapper<T> {
  /** The wrapped client */
  client: T;

  /** Get original client (for emergency bypass) */
  unwrap(): T;

  /** Pause telemetry collection */
  pauseTelemetry(): void;

  /** Resume telemetry collection */
  resumeTelemetry(): void;

  /** Flush pending telemetry */
  flushTelemetry(): Promise<void>;

  /** Check if proxy is active */
  isProxyActive(): boolean;
}

/**
 * Default configurations
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: true,
  includePrompts: false,
  includeResponses: false,
  sampleRate: 1.0,
  batchSize: 10,
  flushIntervalMs: 5000,
  endpoint: "https://api.skew.ai/v1/telemetry",
};

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  failOpen: true,
  baseUrl: "https://api.skew.ai/v1/openai",
  timeoutMs: 30000,
};

/**
 * Model pricing (per 1M tokens)
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "o1": { input: 15.0, output: 60.0 },
  "o1-mini": { input: 3.0, output: 12.0 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};
