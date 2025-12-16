/**
 * Calculate cost based on model and token usage
 * Pricing information based on OpenAI's pricing
 * Prices are per 1M tokens (in USD)
 */

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// Pricing per 1M tokens (in USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // GPT-5 series
  "gpt-5.2": {
    input: 1.75,
    output: 14.0,
  },
  "gpt-5.1": {
    input: 1.25,
    output: 10.0,
  },
  "gpt-5": {
    input: 1.25,
    output: 10.0,
  },
  "gpt-5-mini": {
    input: 0.25,
    output: 2.0,
  },
  "gpt-5-nano": {
    input: 0.05,
    output: 0.4,
  },
  "gpt-5.2-chat-latest": {
    input: 1.75,
    output: 14.0,
  },
  "gpt-5.1-chat-latest": {
    input: 1.25,
    output: 10.0,
  },
  "gpt-5-chat-latest": {
    input: 1.25,
    output: 10.0,
  },
  "gpt-5.2-pro": {
    input: 21.0,
    output: 168.0,
  },
  "gpt-5-pro": {
    input: 15.0,
    output: 120.0,
  },
  // GPT-4 series
  "gpt-4.1": {
    input: 2.0,
    output: 8.0,
  },
  "gpt-4.1-mini": {
    input: 0.4,
    output: 1.6,
  },
  "gpt-4.1-nano": {
    input: 0.1,
    output: 0.4,
  },
  "gpt-4o": {
    input: 2.5,
    output: 10.0,
  },
  "gpt-4o-2024-05-13": {
    input: 5.0,
    output: 15.0,
  },
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
  },
  // O-series
  o1: {
    input: 15.0,
    output: 60.0,
  },
  "o1-pro": {
    input: 150.0,
    output: 600.0,
  },
  "o3-pro": {
    input: 20.0,
    output: 80.0,
  },
  o3: {
    input: 2.0,
    output: 8.0,
  },
  "o3-deep-research": {
    input: 10.0,
    output: 40.0,
  },
  "o4-mini": {
    input: 1.1,
    output: 4.4,
  },
  "o4-mini-deep-research": {
    input: 2.0,
    output: 8.0,
  },
  "o3-mini": {
    input: 1.1,
    output: 4.4,
  },
  "o1-mini": {
    input: 1.1,
    output: 4.4,
  },
  // Realtime models
  "gpt-realtime": {
    input: 4.0,
    output: 16.0,
  },
  "gpt-realtime-mini": {
    input: 0.6,
    output: 2.4,
  },
  "gpt-4o-realtime-preview": {
    input: 5.0,
    output: 20.0,
  },
  "gpt-4o-mini-realtime-preview": {
    input: 0.6,
    output: 2.4,
  },
  // Audio models
  "gpt-audio": {
    input: 2.5,
    output: 10.0,
  },
  "gpt-audio-mini": {
    input: 0.6,
    output: 2.4,
  },
  "gpt-4o-audio-preview": {
    input: 2.5,
    output: 10.0,
  },
  "gpt-4o-mini-audio-preview": {
    input: 0.15,
    output: 0.6,
  },
  // Codex models
  "gpt-5.1-codex-max": {
    input: 1.25,
    output: 10.0,
  },
  "gpt-5.1-codex": {
    input: 1.25,
    output: 10.0,
  },
  "gpt-5-codex": {
    input: 1.25,
    output: 10.0,
  },
  "gpt-5.1-codex-mini": {
    input: 0.25,
    output: 2.0,
  },
  "codex-mini-latest": {
    input: 1.5,
    output: 6.0,
  },
  // Search models
  "gpt-5-search-api": {
    input: 1.25,
    output: 10.0,
  },
  "gpt-4o-mini-search-preview": {
    input: 0.15,
    output: 0.6,
  },
  "gpt-4o-search-preview": {
    input: 2.5,
    output: 10.0,
  },
  // Other models
  "computer-use-preview": {
    input: 3.0,
    output: 12.0,
  },
};

export function calculateCost(
  model: string,
  usage: TokenUsage | null | undefined
): number | null {
  if (!usage) {
    return null;
  }

  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    // If model pricing is not found, return null
    // Could also log a warning here
    return null;
  }

  // Calculate cost: (inputTokens / 1M) * inputPrice + (outputTokens / 1M) * outputPrice
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  const totalCost = inputCost + outputCost;

  // Round to 6 decimal places (matching database precision)
  return Math.round(totalCost * 1_000_000) / 1_000_000;
}
