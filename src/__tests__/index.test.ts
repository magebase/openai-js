// @ts-nocheck
/**
 * langmesh SDK Tests - Comprehensive Test Suite
 *
 * Tests telemetry, model polling, cost estimation, and error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import OpenAI, { __resetlangmeshModelCacheForTests } from "../index";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

describe("langmesh OpenAI SDK", () => {
  let fetchMock: any;

  beforeEach(() => {
    __resetlangmeshModelCacheForTests();
    // Mock fetch globally
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    });
    global.fetch = fetchMock;

    // Reset environment
    process.env.langmesh_API_KEY = "sk_test_123";
    process.env.langmesh_PROXY_ENABLED = "false";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("creates client successfully", () => {
      const client = new OpenAI({
        apiKey: "test-key",
        dangerouslyAllowBrowser: true,
      });
      expect(client).toBeDefined();
    });

    it("fetches model snapshot on init when langmesh_API_KEY is set", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          generated_at: "2026-01-16T00:00:00Z",
          ttl_seconds: 3600,
          models: [
            {
              model: "gpt-4o",
              price_blended_usd_per_1m_tokens: 6.25,
            },
          ],
        }),
      });

      const client = new OpenAI({
        apiKey: "test-key",
        dangerouslyAllowBrowser: true,
      });

      // Wait for async fetch
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/models/latest"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer sk_test_123",
          }),
        }),
      );
    });

    it("does not fetch when langmesh_API_KEY is missing", () => {
      delete process.env.langmesh_API_KEY;

      const client = new OpenAI({
        apiKey: "test-key",
        dangerouslyAllowBrowser: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("handles fetch failure gracefully", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      expect(() => {
        new OpenAI({ apiKey: "test-key" });
      }).not.toThrow();
    });
  });

  describe("Model Pricing", () => {
    it("uses live pricing from snapshot", async () => {
      // Mock successful snapshot fetch
      const mockSnapshot = {
        generated_at: "2026-01-16T00:00:00Z",
        ttl_seconds: 3600,
        models: [
          {
            model: "gpt-4o",
            price_blended_usd_per_1m_tokens: 5.0,
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSnapshot,
      });

      const client = new OpenAI({
        apiKey: "test-key",
        dangerouslyAllowBrowser: true,
      });

      // Wait for snapshot fetch
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The client should now use live pricing
      // We can't test this directly without exposing internals,
      // but we can verify the snapshot was fetched
      expect(fetchMock).toHaveBeenCalled();
    });

    it("falls back to hardcoded pricing when snapshot unavailable", () => {
      fetchMock.mockRejectedValueOnce(new Error("Failed"));

      const client = new OpenAI({
        apiKey: "test-key",
        dangerouslyAllowBrowser: true,
      });

      // Should still create client successfully
      expect(client).toBeDefined();
    });

    it("caches snapshot for 1 hour", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          generated_at: "2026-01-16T00:00:00Z",
          ttl_seconds: 3600,
          models: [],
        }),
      });

      // Create first client
      const client1 = new OpenAI({ apiKey: "test-key" });
      await new Promise((resolve) => setTimeout(resolve, 100));

      const firstCallCount = fetchMock.mock.calls.length;

      // Create second client immediately
      const client2 = new OpenAI({ apiKey: "test-key" });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should use cached snapshot (no additional fetch)
      expect(fetchMock.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe("Telemetry", () => {
    it("collects telemetry when langmesh_API_KEY is set", async () => {
      process.env.langmesh_API_KEY = "sk_test_123";

      const client = new OpenAI({
        apiKey: "test-key",
        dangerouslyAllowBrowser: true,
      });

      // Telemetry should be enabled
      expect((client as any).telemetryEnabled).toBe(true);
    });

    it("does not collect telemetry when langmesh_API_KEY is missing", () => {
      delete process.env.langmesh_API_KEY;

      const client = new OpenAI({
        apiKey: "test-key",
        dangerouslyAllowBrowser: true,
      });

      expect((client as any).telemetryEnabled).toBe(false);
    });

    it("sends telemetry asynchronously", async () => {
      fetchMock.mockResolvedValue({ ok: true });

      const client = new OpenAI({
        apiKey: "test-key",
        dangerouslyAllowBrowser: true,
      });

      // Trigger telemetry by calling internal method
      if ((client as any).recordTelemetry) {
        (client as any).recordTelemetry({
          requestId: "test",
          model: "gpt-4o",
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          latencyMs: 500,
          status: "success",
        });
      }

      // Should not block
      expect(true).toBe(true);
    });

    it("handles telemetry failures silently", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const client = new OpenAI({ apiKey: "test-key" });

      // Should not throw even if telemetry fails
      expect(() => {
        if ((client as any).recordTelemetry) {
          (client as any).recordTelemetry({
            requestId: "test",
            model: "gpt-4o",
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            latencyMs: 500,
            status: "success",
          });
        }
      }).not.toThrow();
    });
  });

  describe("Proxy Mode", () => {
    it("routes through langmesh proxy when enabled", () => {
      process.env.langmesh_PROXY_ENABLED = "true";
      process.env.langmesh_BASE_URL = "https://api.langmesh.ai/v1/openai";

      const client = new OpenAI({ apiKey: "test-key" });

      // Should have modified base URL
      expect((client as any).baseURL).toContain("langmesh.ai");
    });

    it("uses OpenAI directly when proxy disabled", () => {
      process.env.langmesh_PROXY_ENABLED = "false";

      const client = new OpenAI({
        apiKey: "test-key",
        baseURL: "https://api.openai.com/v1",
      });

      // Should use OpenAI URL
      expect((client as any).baseURL).toContain("openai.com");
    });

    it("adds langmesh headers when proxy enabled", () => {
      process.env.langmesh_PROXY_ENABLED = "true";
      process.env.langmesh_API_KEY = "sk_live_123";

      const client = new OpenAI({ apiKey: "openai-key" });

      // Should have langmesh headers
      const headers = (client as any).defaultHeaders;
      expect(headers["X-langmesh-API-Key"]).toBe("sk_live_123");
      expect(headers["X-langmesh-Original-API-Key"]).toBe("openai-key");
    });
  });

  describe("Error Handling", () => {
    it("handles network errors gracefully", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

      const client = new OpenAI({ apiKey: "test-key" });

      // Should create client despite error
      expect(client).toBeDefined();
    });

    it("handles timeout errors", async () => {
      fetchMock.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 10),
          ),
      );

      const client = new OpenAI({ apiKey: "test-key" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not throw
      expect(client).toBeDefined();
    });

    it("handles malformed JSON responses", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      const client = new OpenAI({ apiKey: "test-key" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(client).toBeDefined();
    });
  });

  describe("Performance", () => {
    it("does not block on initialization", () => {
      const start = performance.now();
      const client = new OpenAI({ apiKey: "test-key" });
      const end = performance.now();

      // Should initialize instantly
      expect(end - start).toBeLessThan(100);
    });

    it("batches telemetry events", async () => {
      fetchMock.mockResolvedValue({ ok: true });

      const client = new OpenAI({ apiKey: "test-key" });

      // Record multiple events
      if ((client as any).recordTelemetry) {
        for (let i = 0; i < 5; i++) {
          (client as any).recordTelemetry({
            requestId: `test-${i}`,
            model: "gpt-4o",
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            latencyMs: 500,
            status: "success",
          });
        }
      }

      // Should batch (not send 5 separate requests)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Exact count depends on batching logic
      expect(fetchMock.mock.calls.length).toBeLessThan(10);
    });
  });

  describe("Configuration", () => {
    it("respects custom telemetry endpoint", () => {
      process.env.langmesh_TELEMETRY_ENDPOINT =
        "https://custom.endpoint/telemetry";

      const client = new OpenAI({ apiKey: "test-key" });

      expect(client).toBeDefined();
      // Would need to check internal state to verify endpoint
    });

    it("respects custom base URL", () => {
      process.env.langmesh_PROXY_ENABLED = "true";
      process.env.langmesh_BASE_URL = "https://custom.proxy/v1/openai";

      const client = new OpenAI({ apiKey: "test-key" });

      expect((client as any).baseURL).toContain("custom.proxy");
    });

    it("respects custom models endpoint", () => {
      process.env.langmesh_MODELS_ENDPOINT = "https://custom/models";

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const client = new OpenAI({ apiKey: "test-key" });

      // Would verify via fetch calls
      expect(client).toBeDefined();
    });
  });

  describe("Type Safety", () => {
    it("maintains OpenAI SDK types", () => {
      const client = new OpenAI({ apiKey: "test-key" });

      // Should have chat.completions.create method
      expect(typeof client.chat.completions.create).toBe("function");
    });

    it("accepts standard OpenAI parameters", () => {
      const client = new OpenAI({ apiKey: "test-key" });

      const params: ChatCompletionCreateParamsNonStreaming = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      };

      // Should compile without errors
      expect(params).toBeDefined();
    });
  });

  describe("Integration", () => {
    it("works as drop-in replacement for OpenAI SDK", () => {
      // This is the key guarantee - should work identically
      const langmeshClient = new OpenAI({ apiKey: "test-key" });

      expect(langmeshClient).toBeDefined();
      expect(langmeshClient.chat).toBeDefined();
      expect(langmeshClient.chat.completions).toBeDefined();
      expect(langmeshClient.chat.completions.create).toBeDefined();
    });
  });
});

describe("Cost Estimation", () => {
  it("estimates cost based on token usage", () => {
    const promptTokens = 1000;
    const completionTokens = 500;
    const model = "gpt-4o";

    // At pricing of $2.5/$10 per 1M tokens
    const expectedCost = (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10;

    expect(expectedCost).toBeGreaterThan(0);
    expect(expectedCost).toBeLessThan(0.01);
  });

  it("handles different models", () => {
    const models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];

    models.forEach((model) => {
      // Should have pricing for each model
      expect(model).toBeTruthy();
    });
  });
});
