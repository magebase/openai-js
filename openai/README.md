# @langmesh/openai

langmesh SDK for OpenAI - Telemetry and cost optimization without touching your traffic.

## Installation

```bash
npm install @langmesh/openai
# or
yarn add @langmesh/openai
# or
pnpm add @langmesh/openai
```

## Quick Start

**Start with the SDK. It observes only — langmesh will not touch your traffic.**

```typescript
import { OpenAI } from "openai";
import { langmeshWrap } from "@langmesh/openai";

// Your existing OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Wrap with langmesh for telemetry (no behavior changes)
const client = langmeshWrap(openai, {
  apiKey: process.env.langmesh_API_KEY,
});

// Use exactly as before
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

## SDK Guarantees

- ✅ **Zero behavior changes** - Your code works exactly as before
- ✅ **No request modification** - Requests pass through unchanged
- ✅ **Async telemetry** - Never blocks your requests
- ✅ **Fail-safe** - SDK errors never break your app
- ✅ **No raw prompts** - Only metadata sent by default
- ✅ **Removable in minutes** - Just unwrap the client

## Proxy Mode (Advanced)

When you enable policies that require enforcement, the SDK automatically routes through langmesh's proxy:

```typescript
const client = langmeshWrap(openai, {
  apiKey: process.env.langmesh_API_KEY,
  proxy: {
    enabled: true, // Enable when policies require it
  },
});
```

Proxy mode only activates when:

1. You explicitly enable it
2. At least one policy requires routing

## Configuration

```typescript
const client = langmeshWrap(openai, {
  apiKey: process.env.langmesh_API_KEY,

  // Optional: Organization ID (auto-detected from key)
  orgId: "org_xxx",

  // Optional: Project ID for grouping
  projectId: "my-project",

  // Telemetry options
  telemetry: {
    enabled: true, // Default: true
    includePrompts: false, // Default: false (privacy)
    sampleRate: 1.0, // Default: 1.0 (all requests)
  },

  // Proxy options (for enforcement)
  proxy: {
    enabled: false, // Default: false
    failOpen: true, // Default: true (never break on proxy failure)
  },
});
```

## Unwrapping

If you need to bypass langmesh temporarily:

```typescript
// Get the original OpenAI client
const originalClient = client.unwrap();

// Or pause telemetry
client.pauseTelemetry();
// ... do something ...
client.resumeTelemetry();
```

## TypeScript Support

Full TypeScript support with the same types as the official OpenAI SDK.

## License

MIT
