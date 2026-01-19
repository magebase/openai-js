/**
 * langmesh OpenAI Wrapper
 *
 * Wraps the OpenAI client with telemetry and optional proxy support.
 *
 * Invariants:
 * - No behavior changes without explicit configuration
 * - Telemetry is async and non-blocking
 * - SDK errors never break user code
 * - Proxy only activates when explicitly enabled
 */

import type { OpenAI } from "openai";
import type {
  langmeshConfig,
  langmeshWrapper,
  TelemetryPayload,
  TelemetryRequest,
  TelemetryResponse,
  TelemetryContext,
  TelemetryConfig,
  ProxyConfig,
} from "./types";
import { DEFAULT_TELEMETRY_CONFIG, DEFAULT_PROXY_CONFIG } from "./types";
import {
  TelemetryClient,
  generateRequestId,
  hashPrompt,
  calculateCost,
} from "./telemetry";

const SDK_VERSION = "1.0.0";

interface FullConfig {
  apiKey: string;
  orgId?: string;
  projectId?: string;
  telemetry: TelemetryConfig;
  proxy: ProxyConfig;
}

/**
 * Wrap an OpenAI client with langmesh telemetry and optional proxy
 */
export function langmeshWrap<T extends OpenAI>(
  openaiClient: T,
  config: langmeshConfig,
): T & langmeshWrapper<T> {
  const fullConfig: FullConfig = {
    apiKey: config.apiKey,
    orgId: config.orgId,
    projectId: config.projectId,
    telemetry: { ...DEFAULT_TELEMETRY_CONFIG, ...config.telemetry },
    proxy: { ...DEFAULT_PROXY_CONFIG, ...config.proxy },
  };

  const telemetryClient = new TelemetryClient(
    fullConfig.apiKey,
    fullConfig.telemetry,
  );

  // If proxy is enabled, modify the base URL
  let proxyActive = false;
  if (fullConfig.proxy.enabled) {
    proxyActive = true;
    // The OpenAI client uses baseURL option
    // We need to intercept and route through proxy
  }

  const handler: ProxyHandler<T> = {
    get(target, prop, receiver) {
      // Handle langmesh-specific methods
      if (prop === "unwrap") {
        return () => openaiClient;
      }
      if (prop === "client") {
        return openaiClient;
      }
      if (prop === "pauseTelemetry") {
        return () => telemetryClient.pause();
      }
      if (prop === "resumeTelemetry") {
        return () => telemetryClient.resume();
      }
      if (prop === "flushTelemetry") {
        return () => telemetryClient.flush();
      }
      if (prop === "isProxyActive") {
        return () => proxyActive;
      }

      const value = Reflect.get(target, prop, receiver);

      // Wrap namespaces (chat, completions, etc.)
      if (typeof value === "object" && value !== null) {
        return wrapNamespace(value, telemetryClient, fullConfig, proxyActive);
      }

      return value;
    },
  };

  return new Proxy(openaiClient, handler) as T & langmeshWrapper<T>;
}

function wrapNamespace(
  namespace: object,
  telemetryClient: TelemetryClient,
  config: FullConfig,
  proxyActive: boolean,
): object {
  const handler: ProxyHandler<object> = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof value === "function") {
        return wrapMethod(
          value.bind(target),
          prop as string,
          telemetryClient,
          config,
          proxyActive,
        );
      }

      if (typeof value === "object" && value !== null) {
        return wrapNamespace(value, telemetryClient, config, proxyActive);
      }

      return value;
    },
  };

  return new Proxy(namespace, handler);
}

function wrapMethod(
  method: Function,
  methodName: string,
  telemetryClient: TelemetryClient,
  config: FullConfig,
  proxyActive: boolean,
): Function {
  return async function wrapped(...args: unknown[]) {
    const requestId = generateRequestId();
    const timestampStart = new Date().toISOString();
    const params = args[0] as Record<string, unknown> | undefined;

    // If proxy is active, add langmesh headers to the request
    if (proxyActive && params) {
      const headers = (params.headers as Record<string, string>) || {};
      params.headers = {
        ...headers,
        "X-langmesh-API-Key": config.apiKey,
        "X-langmesh-Request-ID": requestId,
        "X-langmesh-Org-ID": config.orgId || "",
      };
    }

    try {
      const result = await method(...args);

      // Send telemetry asynchronously
      buildAndSendTelemetry(
        telemetryClient,
        config,
        requestId,
        timestampStart,
        methodName,
        params,
        result,
        null,
        proxyActive,
      ).catch(() => {});

      return result;
    } catch (error) {
      // Send error telemetry
      buildAndSendTelemetry(
        telemetryClient,
        config,
        requestId,
        timestampStart,
        methodName,
        params,
        null,
        error,
        proxyActive,
      ).catch(() => {});

      // Always rethrow original error unchanged
      throw error;
    }
  };
}

async function buildAndSendTelemetry(
  telemetryClient: TelemetryClient,
  config: FullConfig,
  requestId: string,
  timestampStart: string,
  methodName: string,
  params: Record<string, unknown> | undefined,
  result: unknown,
  error: unknown,
  proxyActive: boolean,
): Promise<void> {
  const timestampEnd = new Date().toISOString();
  const latencyMs =
    new Date(timestampEnd).getTime() - new Date(timestampStart).getTime();

  const model = (params?.model as string) || "unknown";
  const usage = (
    result as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }
  )?.usage;

  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const totalTokens = usage?.total_tokens || promptTokens + completionTokens;

  const request: TelemetryRequest = {
    requestId,
    orgId: config.orgId || "",
    projectId: config.projectId,
    endpoint: methodToEndpoint(methodName),
    model,
    maxTokens: params?.max_tokens as number | undefined,
    temperature: params?.temperature as number | undefined,
    timestampStart,
  };

  const response: TelemetryResponse = {
    timestampEnd,
    tokenUsage: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
    costEstimateUsd: calculateCost(model, promptTokens, completionTokens),
    latencyMs,
  };

  if (error) {
    response.errorClass = (error as Error).name || "Error";
    response.errorMessage = (error as Error).message || "Unknown error";
  }

  const context: TelemetryContext = {
    sdkLanguage: "javascript",
    sdkVersion: SDK_VERSION,
    openaiClientVersion: "unknown",
  };

  // Add prompt hash if configured
  if (!config.telemetry.includePrompts && params?.messages) {
    context.promptHash = await hashPrompt(JSON.stringify(params.messages));
  }

  const payload: TelemetryPayload = { request, response, context };
  await telemetryClient.submit(payload);
}

function methodToEndpoint(methodName: string): string {
  const mapping: Record<string, string> = {
    create: "chat.completions",
    generate: "images.generate",
    transcriptions: "audio.transcriptions",
    translations: "audio.translations",
    embeddings: "embeddings",
    moderations: "moderations",
  };

  return mapping[methodName] || "chat.completions";
}
