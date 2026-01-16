/**
 * SKEW Telemetry Client
 *
 * Async, non-blocking telemetry submission
 */

import type { TelemetryConfig, TelemetryPayload } from "./types";
import { DEFAULT_TELEMETRY_CONFIG } from "./types";

export class TelemetryClient {
  private config: TelemetryConfig;
  private apiKey: string;
  private buffer: TelemetryPayload[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isPaused = false;

  constructor(apiKey: string, config?: Partial<TelemetryConfig>) {
    this.apiKey = apiKey;
    this.config = { ...DEFAULT_TELEMETRY_CONFIG, ...config };

    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Submit telemetry - never blocks, never throws
   */
  async submit(payload: TelemetryPayload): Promise<void> {
    if (!this.config.enabled || this.isPaused) {
      return;
    }

    // Apply sampling
    if (Math.random() > this.config.sampleRate) {
      return;
    }

    this.buffer.push(payload);

    if (this.buffer.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flush buffered telemetry
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const batch = [...this.buffer];
    this.buffer = [];

    try {
      await this.sendBatch(batch);
    } catch {
      // Silent drop - telemetry must never affect user
    }
  }

  private async sendBatch(batch: TelemetryPayload[]): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-SKEW-SDK-Version": "1.0.0",
          "X-SKEW-SDK-Language": "javascript",
        },
        body: JSON.stringify({ events: batch }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Log but don't throw
        console.debug?.(`[SKEW] Telemetry failed: ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.config.flushIntervalMs);
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush().catch(() => {});
  }
}

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Hash prompt for deduplication without storing content
 */
export async function hashPrompt(prompt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(prompt);

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .substring(0, 16);
  }

  // Fallback for environments without crypto.subtle
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 16);
}

/**
 * Calculate cost estimate
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o": { input: 2.5, output: 10.0 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4-turbo": { input: 10.0, output: 30.0 },
    "gpt-4": { input: 30.0, output: 60.0 },
    "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  };

  const price = pricing[model];
  if (!price) {
    return (promptTokens + completionTokens) * 0.00001;
  }

  return (
    (promptTokens / 1_000_000) * price.input +
    (completionTokens / 1_000_000) * price.output
  );
}
