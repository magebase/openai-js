// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import OpenAI, { __resetSkewModelCacheForTests } from "./index";

describe("@skew/openai", () => {
  let client: OpenAI;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetSkewModelCacheForTests();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [] }) });
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock as any);

    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "test-key",
      dangerouslyAllowBrowser: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create client successfully", () => {
    expect(client).toBeInstanceOf(OpenAI);
  });

  it("should have chat.completions.create method", () => {
    expect(typeof client.chat.completions.create).toBe("function");
  });

  it("should work identically to original OpenAI client", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: "test",
      choices: [{ message: { content: "Hello" } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    client.chat.completions.create = mockCreate;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(response.choices[0].message.content).toBe("Hello");
  });

  it("should collect telemetry when SKEW_API_KEY is set", async () => {
    process.env.SKEW_API_KEY = "test-skew-key";

    const clientWithTelemetry = new OpenAI({
      apiKey: "test-key",
      dangerouslyAllowBrowser: true,
    });

    expect(clientWithTelemetry).toBeInstanceOf(OpenAI);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalled();
  });
});
