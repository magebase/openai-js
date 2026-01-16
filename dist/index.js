"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openai_1 = __importDefault(require("openai"));
// Configuration from environment
const SKEW_API_KEY = process.env.SKEW_API_KEY || "";
const SKEW_TELEMETRY_ENDPOINT = process.env.SKEW_TELEMETRY_ENDPOINT || "https://api.skew.ai/v1/telemetry";
const SKEW_PROXY_ENABLED = process.env.SKEW_PROXY_ENABLED === "true";
const SKEW_BASE_URL = process.env.SKEW_BASE_URL || "https://api.skew.ai/v1/openai";
const SKEW_MODELS_ENDPOINT = process.env.SKEW_MODELS_ENDPOINT || "https://api.skew.ai/v1/models/latest";
let cachedModels = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour
/**
 * SKEW-wrapped OpenAI client
 *
 * Transparently adds:
 * - Telemetry collection (always on, privacy-preserving)
 * - Proxy routing (only when SKEW_PROXY_ENABLED=true)
 */
class OpenAI extends openai_1.default {
    constructor(options = {}) {
        // If proxy is enabled, route through SKEW
        const clientOptions = SKEW_PROXY_ENABLED
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
        this.telemetryBuffer = [];
        this.flushInterval = null;
        this.skewApiKey = SKEW_API_KEY;
        this.telemetryEnabled = !!SKEW_API_KEY;
        if (this.telemetryEnabled) {
            this.startTelemetry();
            this.fetchModelsSnapshot(); // Fetch on init
        }
        // Wrap chat.completions.create
        this.wrapChatCompletions();
    }
    async fetchModelsSnapshot() {
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
                cachedModels = (await response.json());
                lastFetchTime = now;
            }
        }
        catch (error) {
            // Fail silently - use last known snapshot or fallback
            console.warn("Failed to fetch model snapshot:", error);
        }
    }
    getModelPricing(model) {
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
        const pricing = {
            "gpt-4o": { input: 2.5, output: 10.0 },
            "gpt-4o-mini": { input: 0.15, output: 0.6 },
            "gpt-4-turbo": { input: 10.0, output: 30.0 },
            "gpt-4": { input: 30.0, output: 60.0 },
            "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
        };
        return pricing[model] || { input: 0.01, output: 0.01 };
    }
    wrapChatCompletions() {
        const originalCreate = this.chat.completions.create.bind(this.chat.completions);
        this.chat.completions.create = (async (body, options) => {
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
                        cost_estimate_usd: this.estimateCost(body.model, result.usage?.prompt_tokens || 0, result.usage?.completion_tokens || 0),
                        status: "success",
                    });
                }
                return result;
            }
            catch (error) {
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
                        error_class: error.name,
                        error_message: error.message,
                    });
                }
                throw error;
            }
        });
    }
    recordTelemetry(event) {
        this.telemetryBuffer.push(event);
        if (this.telemetryBuffer.length >= 10) {
            this.flushTelemetry();
        }
    }
    async flushTelemetry() {
        if (this.telemetryBuffer.length === 0)
            return;
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
        }
        catch {
            // Silent drop - telemetry must never break user's app
        }
    }
    startTelemetry() {
        this.flushInterval = setInterval(() => {
            this.flushTelemetry();
        }, 5000);
    }
    estimateCost(model, promptTokens, completionTokens) {
        const modelPricing = this.getModelPricing(model);
        return ((promptTokens / 1000000) * modelPricing.input +
            (completionTokens / 1000000) * modelPricing.output);
    }
}
exports.default = OpenAI;
__exportStar(require("openai"), exports);
