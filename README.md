# @langmesh/openai

Drop-in replacement for the OpenAI JavaScript/TypeScript client with automatic cost optimization and telemetry.

## Installation

```bash
npm install @langmesh/openai
# or
yarn add @langmesh/openai
# or
pnpm add @langmesh/openai
```

## Usage

Change one line of code:

```typescript
// Before
import OpenAI from "openai";

// After
import OpenAI from "@langmesh/openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Everything works exactly the same!
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

That's it. No configuration needed.

## What It Does

### Telemetry (Always On)

- Tracks token usage, cost, and latency
- Privacy-preserving (no prompts sent by default)
- Zero performance impact (async)
- Never breaks your app (fail-safe)

### Cost Optimization (Opt-In)

When you enable policies in the langmesh dashboard:

- Automatic model downgrading for simple queries
- Retry storm suppression
- Exact Cache (identical requests)
- Semantic Deduplication (high-threshold reuse)
- Semantic Answer Cache (advanced, opt-in)
- Token optimization

## Configuration

### Required

```bash
langmesh_API_KEY=sk_live_...  # Get from dashboard.langmesh.ai
```

### Optional

```bash
langmesh_PROXY_ENABLED=true  # Enable when policies require routing
langmesh_BASE_URL=https://api.langmesh.ai/v1/openai  # Custom proxy URL
```

## Migration Path

1. **Install** - `npm install @langmesh/openai`
2. **Replace import** - Change `"openai"` to `"@langmesh/openai"`
3. **Set API key** - `export langmesh_API_KEY=sk_live_...`
4. **See savings** - Visit dashboard.langmesh.ai
5. **Enable policies** - When ready, set `langmesh_PROXY_ENABLED=true`

## Guarantees

✅ Drop-in replacement - works identically
✅ No behavior changes without opt-in
✅ Fail-safe - errors don't break your app
✅ Reversible - uninstall anytime
✅ Privacy-first - no prompts sent by default

## License

MIT
