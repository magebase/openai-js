/**
 * @langmesh/openai - Drop-in replacement for OpenAI client
 *
 * Usage:
 * ```typescript
 * // Before
 * import OpenAI from "openai";
 *
 * // After
 * import OpenAI from "@langmesh/openai";
 *
 * const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 * // Works exactly the same!
 * ```
 */
import OriginalOpenAI from "openai";
import type { ClientOptions } from "openai";
/**
 * langmesh-wrapped OpenAI client
 *
 * Transparently adds:
 * - Telemetry collection (always on, privacy-preserving)
 * - Proxy routing (only when langmesh_PROXY_ENABLED=true)
 */
declare class OpenAI extends OriginalOpenAI {
    private langmeshApiKey;
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
