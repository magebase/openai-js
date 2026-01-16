# @skew/openai

Drop-in replacement for the OpenAI JavaScript/TypeScript client with automatic cost optimization and telemetry.

## Installation

```bash
npm install @skew/openai
# or
yarn add @skew/openai
# or
pnpm add @skew/openai
```

## Usage

Change one line of code:

```typescript
// Before
import OpenAI from "openai";

// After
import OpenAI from "@skew/openai";

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
When you enable policies in the SKEW dashboard:
- Automatic model downgrading for simple queries
- Retry storm suppression
- Semantic caching
- Token optimization

## Configuration

### Required
```bash
SKEW_API_KEY=sk_live_...  # Get from dashboard.skew.ai
```

### Optional
```bash
SKEW_PROXY_ENABLED=true  # Enable when policies require routing
SKEW_BASE_URL=https://api.skew.ai/v1/openai  # Custom proxy URL
```

## Migration Path

1. **Install** - `npm install @skew/openai`
2. **Replace import** - Change `"openai"` to `"@skew/openai"`
3. **Set API key** - `export SKEW_API_KEY=sk_live_...`
4. **See savings** - Visit dashboard.skew.ai
5. **Enable policies** - When ready, set `SKEW_PROXY_ENABLED=true`

## Guarantees

✅ Drop-in replacement - works identically  
✅ No behavior changes without opt-in  
✅ Fail-safe - errors don't break your app  
✅ Reversible - uninstall anytime  
✅ Privacy-first - no prompts sent by default  

## License

MIT
