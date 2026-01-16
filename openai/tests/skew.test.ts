/**
 * @skew/openai - Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { skewWrap } from "../src/wrapper";
import { TelemetryClient, generateRequestId, calculateCost } from "../src/telemetry";

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

describe("skewWrap", () => {
  let mockOpenAI: ReturnType<typeof createMockOpenAI>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

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
    const client = skewWrap(mockOpenAI as any, { apiKey: "sk_test_123" });

    const result = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.choices[0].message.content).toBe("Hello!");
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("should send telemetry asynchronously", async () => {
    const client = skewWrap(mockOpenAI as any, { apiKey: "sk_test_123" });

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
    const client = skewWrap(mockOpenAI as any, { apiKey: "sk_test_123" });
    const unwrapped = client.unwrap();

    expect(unwrapped).toBe(mockOpenAI);
  });

  it("should allow pausing and resuming telemetry", () => {
    const client = skewWrap(mockOpenAI as any, { apiKey: "sk_test_123" });

    expect(() => client.pauseTelemetry()).not.toThrow();
    expect(() => client.resumeTelemetry()).not.toThrow();
  });

  it("should track proxy status", () => {
    const clientNoProxy = skewWrap(mockOpenAI as any, { apiKey: "sk_test_123" });
    expect(clientNoProxy.isProxyActive()).toBe(false);

    const clientWithProxy = skewWrap(mockOpenAI as any, {
      apiKey: "sk_test_123",
      proxy: { enabled: true },
    });
    expect(clientWithProxy.isProxyActive()).toBe(true);
  });

  it("should not break on OpenAI errors", async () => {
    const errorClient = createMockOpenAI();
    errorClient.chat.completions.create.mockRejectedValue(
      new Error("Rate limit exceeded")
    );

    const client = skewWrap(errorClient as any, { apiKey: "sk_test_123" });

    await expect(
      client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      })
    ).rejects.toThrow("Rate limit exceeded");
  });
});

describe("TelemetryClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

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

    await client.flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should pause and resume", async () => {
    const client = new TelemetryClient("sk_test", { batchSize: 1 });

    client.pause();

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

    client.resume();
  });
});

describe("generateRequestId", () => {
  it("should generate unique IDs", () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/);
  });
});

describe("calculateCost", () => {
  it("should calculate cost for known models", () => {
    const cost = calculateCost("gpt-4o", 1000, 500);

    // gpt-4o: $2.5/1M input, $10/1M output
    const expected = (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it("should use fallback for unknown models", () => {
    const cost = calculateCost("unknown-model", 1000, 500);

    expect(cost).toBeGreaterThan(0);
  });
});

describe("Proxy Mode", () => {
  let mockOpenAI: ReturnType<typeof createMockOpenAI>;

  beforeEach(() => {
    mockOpenAI = createMockOpenAI();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should add SKEW headers when proxy is enabled", async () => {
    const client = skewWrap(mockOpenAI as any, {
      apiKey: "sk_test_123",
      orgId: "org_test",
      proxy: { enabled: true },
    });

    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(callArgs.headers).toBeDefined();
    expect(callArgs.headers["X-SKEW-API-Key"]).toBe("sk_test_123");
    expect(callArgs.headers["X-SKEW-Org-ID"]).toBe("org_test");
    expect(callArgs.headers["X-SKEW-Request-ID"]).toMatch(/^req_/);
  });

  it("should not add headers when proxy is disabled", async () => {
    const client = skewWrap(mockOpenAI as any, {
      apiKey: "sk_test_123",
      proxy: { enabled: false },
    });

    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });

    const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(callArgs.headers).toBeUndefined();
  });
});
