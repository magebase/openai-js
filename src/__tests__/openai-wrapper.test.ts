/**
 * langmesh OpenAI Wrapper - Telemetry and Pricing Coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type OpenAIModule = typeof import("../index");
let OpenAI: OpenAIModule["default"];
let __resetlangmeshModelCacheForTests: OpenAIModule["__resetlangmeshModelCacheForTests"];

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    baseURL: string;
    defaultHeaders?: Record<string, string>;
    chat = {
      completions: {
        create: mockCreate,
      },
    };

    constructor(
      options: {
        baseURL?: string;
        defaultHeaders?: Record<string, string>;
      } = {},
    ) {
      this.baseURL = options.baseURL ?? "https://api.openai.com/v1";
      this.defaultHeaders = options.defaultHeaders ?? {};
    }
  },
}));

describe("OpenAI wrapper telemetry", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({
      default: OpenAI,
      __resetlangmeshModelCacheForTests,
    } = await import("../index"));
    __resetlangmeshModelCacheForTests();
    mockCreate.mockReset();
    process.env.langmesh_API_KEY = "sk_test";
    process.env.langmesh_PROXY_ENABLED = "false";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records successful telemetry with cached pricing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generated_at: "2026-01-16T00:00:00Z",
        ttl_seconds: 3600,
        models: [
          {
            model: "gpt-4o",
            price_blended_usd_per_1m_tokens: 10,
          },
        ],
      }),
    }) as any;

    mockCreate.mockResolvedValue({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      },
    });

    const client = new OpenAI({
      apiKey: "openai-key",
      dangerouslyAllowBrowser: true,
    });

    await (client as any).fetchModelsSnapshot();

    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [],
    });

    const buffer = (client as any).telemetryBuffer;

    expect(buffer).toHaveLength(1);
    expect(buffer[0].status).toBe("success");
    expect(buffer[0].cost_estimate_usd).toBeCloseTo(0.001, 6);
  });

  it("records error telemetry on failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    }) as any;

    mockCreate.mockRejectedValue(new Error("boom"));

    const client = new OpenAI({ apiKey: "openai-key" });

    await expect(
      client.chat.completions.create({ model: "gpt-4o", messages: [] }),
    ).rejects.toThrow("boom");

    const buffer = (client as any).telemetryBuffer;

    expect(buffer).toHaveLength(1);
    expect(buffer[0].status).toBe("error");
    expect(buffer[0].error_message).toBe("boom");
  });

  it("flushes telemetry when batch reaches 10", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      }) as any;

    const client = new OpenAI({ apiKey: "openai-key" });

    for (let i = 0; i < 10; i += 1) {
      (client as any).recordTelemetry({
        request_id: `req_${i}`,
        timestamp_start: new Date().toISOString(),
        timestamp_end: new Date().toISOString(),
        model: "gpt-4o",
        endpoint: "chat.completions",
        latency_ms: 10,
        token_usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
        cost_estimate_usd: 0.00001,
        status: "success",
      });
    }

    expect((client as any).telemetryBuffer).toHaveLength(0);
  });
});
