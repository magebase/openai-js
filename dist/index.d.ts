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
/**
 * SKEW-wrapped OpenAI client
 *
 * Transparently adds:
 * - Telemetry collection (always on, privacy-preserving)
 * - Proxy routing (only when SKEW_PROXY_ENABLED=true)
 */
declare class OpenAI extends OriginalOpenAI {
    private skewApiKey;
    private telemetryEnabled;
    private telemetryBuffer;
    private flushInterval;
    constructor(options?: ClientOptions);
    private fetchModelsSnapshot;
    private getModelPricing;
    private wrapChatCompletions;
    private recordTelemetry;
    private flushTelemetry;
    private startTelemetry;
    private estimateCost;
}
export default OpenAI;
export * from "openai";
