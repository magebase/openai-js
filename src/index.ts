/**
 * @skew/openai - Drop-in replacement for OpenAI client
 * 
 * Usage:
 * ```typescript
 * // Before
 * import OpenAI from "openai";
 * 
 * // After
 * import OpenAI from "@skew/openai";
 * 
 * const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 * // Works exactly the same!
 * ```
 */

import OriginalOpenAI from "openai";
import type { ClientOptions } from "openai";

// Configuration from environment
const SKEW_API_KEY = process.env.SKEW_API_KEY || "";
const SKEW_TELEMETRY_ENDPOINT = process.env.SKEW_TELEMETRY_ENDPOINT || "https://api.skew.ai/v1/telemetry";
const SKEW_PROXY_ENABLED = process.env.SKEW_PROXY_ENABLED === "true";
const SKEW_BASE_URL = process.env.SKEW_BASE_URL || "https://api.skew.ai/v1/openai";
const SKEW_MODELS_ENDPOINT = process.env.SKEW_MODELS_ENDPOINT || "https://api.skew.ai/v1/models/latest";

// Model pricing cache
interface ModelSnapshot {
  generated_at: string;
  ttl_seconds: number;
  models: Array<{
    model: string;
    creator: string | null;
    context_window: number | null;
    aa_intelligence_index: number | null;
    price_blended_usd_per_1m_tokens: number | null;
    median_tokens_per_second: number | null;
    latency_first_chunk_seconds: number | null;
  }>;
}

let cachedModels: ModelSnapshot | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * SKEW-wrapped OpenAI client
 * 
 * Transparently adds:
 * - Telemetry collection (always on, privacy-preserving)
 * - Proxy routing (only when SKEW_PROXY_ENABLED=true)
 */
class OpenAI extends OriginalOpenAI {
  private skewApiKey: string;
  private telemetryEnabled: boolean;
  private telemetryBuffer: TelemetryEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(options: ClientOptions = {}) {
    // If proxy is enabled, route through SKEW
    const clientOptions: ClientOptions = SKEW_PROXY_ENABLED
      ? {
          ...options,
          baseURL: SKEW_BASE_URL,
          defaultHeaders: {
            ...options.defaultHeaders,
            "X-SKEW-API-Key": SKEW_API_KEY,
            "X-SKEW-Original-API-Key": options.apiKey || "",
          },
        }
      : options;

    super(clientOptions);

    this.skewApiKey = SKEW_API_KEY;
    this.telemetryEnabled = !!SKEW_API_KEY;

    if (this.telemetryEnabled) {
      this.startTelemetry();
      this.fetchModelsSnapshot(); // Fetch on init
    }

    // Wrap chat.completions.create
    this.wrapChatCompletions();
  }

  private async fetchModelsSnapshot(): Promise<void> {
    const now = Date.now();
    
    // Check if we need to fetch (cache expired or first fetch)
    if (cachedModels && now - lastFetchTime < CACHE_DURATION_MS) {
      return; // Use cached data
    }

    try {
      const response = await fetch(SKEW_MODELS_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${this.skewApiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        cachedModels = await response.json();
        lastFetchTime = now;
      }
    } catch (error) {
      // Fail silently - use last known snapshot or fallback
      console.warn("Failed to fetch model snapshot:", error);
    }
  }

  private getModelPricing(model: string): { input: number; output: number } {
    // Try to get from snapshot first
    if (cachedModels) {
      const modelData = cachedModels.models.find((m) => m.model === model);
      if (modelData && modelData.price_blended_usd_per_1m_tokens) {
        // Use blended price for both input and output as estimate
        const price = modelData.price_blended_usd_per_1m_tokens;
        return { input: price * 0.4, output: price * 0.6 }; // Rough split
      }
    }

    // Fallback to hardcoded prices (will be removed eventually)
    const pricing: Record<string, { input: number; output: number }> = {
      "gpt-4o": { input: 2.5, output: 10.0 },
      "gpt-4o-mini": { input: 0.15, output: 0.6 },
      "gpt-4-turbo": { input: 10.0, output: 30.0 },
      "gpt-4": { input: 30.0, output: 60.0 },
      "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
    };

    return pricing[model] || { input: 0.01, output: 0.01 };
  }

  private wrapChatCompletions(): void {
    const originalCreate = this.chat.completions.create.bind(this.chat.completions);

    this.chat.completions.create = async (body: any, options?: any) => {
      const startTime = Date.now();
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      try {
        const result = await originalCreate(body, options);
        const endTime = Date.now();

        // Collect telemetry
        if (this.telemetryEnabled) {
          this.recordTelemetry({
            request_id: requestId,
            timestamp_start: new Date(startTime).toISOString(),
            timestamp_end: new Date(endTime).toISOString(),
            model: body.model,
            endpoint: "chat.completions",
            latency_ms: endTime - startTime,
            token_usage: {
              prompt_tokens: result.usage?.prompt_tokens || 0,
              completion_tokens: result.usage?.completion_tokens || 0,
              total_tokens: result.usage?.total_tokens || 0,
            },
            cost_estimate_usd: this.estimateCost(
              body.model,
              result.usage?.prompt_tokens || 0,
              result.usage?.completion_tokens || 0
            ),
            status: "success",
          });
        }

        return result;
      } catch (error) {
        const endTime = Date.now();

        // Record error telemetry
        if (this.telemetryEnabled) {
          this.recordTelemetry({
            request_id: requestId,
            timestamp_start: new Date(startTime).toISOString(),
            timestamp_end: new Date(endTime).toISOString(),
            model: body.model,
            endpoint: "chat.completions",
            latency_ms: endTime - startTime,
            token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            cost_estimate_usd: 0,
            status: "error",
            error_class: (error as Error).name,
            error_message: (error as Error).message,
          });
        }

        throw error;
      }
    };
  }

  private recordTelemetry(event: TelemetryEvent): void {
    this.telemetryBuffer.push(event);

    if (this.telemetryBuffer.length >= 10) {
      this.flushTelemetry();
    }
  }

  private async flushTelemetry(): Promise<void> {
    if (this.telemetryBuffer.length === 0) return;

    const batch = [...this.telemetryBuffer];
    this.telemetryBuffer = [];

    try {
      await fetch(SKEW_TELEMETRY_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.skewApiKey}`,
        },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Silent drop - telemetry must never break user's app
    }
  }

  private startTelemetry(): void {
    this.flushInterval = setInterval(() => {
      this.flushTelemetry();
    }, 5000);
  }

  private estimateCost(model: string, promptTokens: number, completionTokens: number): number {
    const modelPricing = this.getModelPricing(model);
    return (
      (promptTokens / 1_000_000) * modelPricing.input +
      (completionTokens / 1_000_000) * modelPricing.output
    );
  }
}

interface TelemetryEvent {
  request_id: string;
  timestamp_start: string;
  timestamp_end: string;
  model: string;
  endpoint: string;
  latency_ms: number;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost_estimate_usd: number;
  status: "success" | "error";
  error_class?: string;
  error_message?: string;
}

export default OpenAI;
export * from "openai";
