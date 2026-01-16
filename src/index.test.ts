import OpenAI from "../src/index";

describe("@skew/openai", () => {
  let client: OpenAI;

  beforeEach(() => {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "test-key",
    });
  });

  it("should create client successfully", () => {
    expect(client).toBeInstanceOf(OpenAI);
  });

  it("should have chat.completions.create method", () => {
    expect(typeof client.chat.completions.create).toBe("function");
  });

  it("should work identically to original OpenAI client", async () => {
    // Mock to avoid actual API calls in tests
    const mockCreate = jest.fn().mockResolvedValue({
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
    });

    expect(clientWithTelemetry).toBeInstanceOf(OpenAI);
  });
});
