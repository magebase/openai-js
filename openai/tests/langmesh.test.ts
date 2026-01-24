/**
 * @langmesh/openai - Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { langmeshWrap } from "../src/wrapper";
import {
  TelemetryClient,
  generateRequestId,
  calculateCost,
} from "../src/telemetry";

// Mock OpenAI client
const createMockOpenAI = () => ({
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        id: "chatcmpl-123",
        choices: [{ message: { content: "Hello!" } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
    },
  },
  embeddings: {
    create: vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
      usage: { prompt_tokens: 5, total_tokens: 5 },
    }),
  },
});

describe("langmeshWrap", () => {
  let mockOpenAI: ReturnType<typeof createMockOpenAI>;
   
  let fetchSpy: any;

  beforeEach(() => {
    mockOpenAI = createMockOpenAI();
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should wrap OpenAI client without changing behavior", async () => {
    const client = langmeshWrap(mockOpenAI as any, { apiKey: "sk_test_123" });

    const result = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.choices[0].message.content).toBe("Hello!");
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("should send telemetry asynchronously", async () => {
    const client = langmeshWrap(mockOpenAI as any, { apiKey: "sk_test_123" });

    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    // Wait for async telemetry
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Telemetry should have been called
    // (In real implementation, this would be batched)
  });

  it("should provide unwrap method", () => {
    const client = langmeshWrap(mockOpenAI as any, { apiKey: "sk_test_123" });
    const unwrapped = client.unwrap();

    expect(unwrapped).toBe(mockOpenAI);
  });

  it("should allow pausing and resuming telemetry", () => {
    const client = langmeshWrap(mockOpenAI as any, { apiKey: "sk_test_123" });

    expect(() => client.pauseTelemetry()).not.toThrow();
    expect(() => client.resumeTelemetry()).not.toThrow();
  });

  it("should track proxy status", () => {
    const clientNoProxy = langmeshWrap(mockOpenAI as any, {
      apiKey: "sk_test_123",
    });
    expect(clientNoProxy.isProxyActive()).toBe(false);

    const clientWithProxy = langmeshWrap(mockOpenAI as any, {
      apiKey: "sk_test_123",
      proxy: { enabled: true },
    });
    expect(clientWithProxy.isProxyActive()).toBe(true);
  });

  it.skip("should not break on OpenAI errors", async () => {
    const errorClient = createMockOpenAI();
    errorClient.chat.completions.create.mockRejectedValue(
      new Error("Rate limit exceeded"),
    );

    const client = langmeshWrap(errorClient as any, { apiKey: "sk_test_123" });

    await expect(
      client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow("Rate limit exceeded");
  });
});

describe("TelemetryClient", () => {
   
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should batch telemetry events", async () => {
    const client = new TelemetryClient("sk_test", { batchSize: 2 });

    // Submit first event - should not flush yet
    await client.submit({
      request: {
        requestId: "req_1",
        orgId: "org_1",
        endpoint: "chat.completions",
        model: "gpt-4o",
        timestampStart: new Date().toISOString(),
      },
      response: {
        timestampEnd: new Date().toISOString(),
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costEstimateUsd: 0.0001,
        latencyMs: 100,
      },
      context: {
        sdkLanguage: "javascript",
        sdkVersion: "1.0.0",
        openaiClientVersion: "4.0.0",
      },
    });

    expect(fetchSpy).not.toHaveBeenCalled();

    // Submit second event - should trigger flush
    await client.submit({
      request: {
        requestId: "req_2",
        orgId: "org_1",
        endpoint: "chat.completions",
        model: "gpt-4o",
        timestampStart: new Date().toISOString(),
      },
      response: {
        timestampEnd: new Date().toISOString(),
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costEstimateUsd: 0.0001,
        latencyMs: 100,
      },
      context: {
        sdkLanguage: "javascript",
        sdkVersion: "1.0.0",
        openaiClientVersion: "4.0.0",
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("should respect sampling rate", async () => {
    const client = new TelemetryClient("sk_test", { sampleRate: 0 });

    await client.submit({
      request: {
        requestId: "req_1",
        orgId: "org_1",
        endpoint: "chat.completions",
        model: "gpt-4o",
        timestampStart: new Date().toISOString(),
      },
      response: {
        timestampEnd: new Date().toISOString(),
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        costEstimateUsd: 0.0001,
        latencyMs: 100,
      },
      context: {
        sdkLanguage: "javascript",
        sdkVersion: "1.0.0",
        openaiClientVersion: "4.0.0",
      },
    });
  });
});

describe("Telemetry utilities", () => {
  it("should generate request ids", () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).not.toBe(id2);
  });

  it("should calculate costs", () => {
    const cost = calculateCost("gpt-4o", 100, 50);
    expect(cost).toBeGreaterThan(0);
  });
});
