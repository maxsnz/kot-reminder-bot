/**
 * Classifies an AI-worker error as "permanent" (retrying is pointless,
 * e.g. quota/billing/auth) or "transient" (network blip, rate limit,
 * OpenAI 5xx — should be retried).
 *
 * Used by ai-request and ai-result workers to decide whether to keep
 * retrying via Graphile Worker.
 */
export type AiErrorClass = "permanent" | "transient";

export function classifyAiError(errorMessage: string): AiErrorClass {
  const msg = errorMessage.toLowerCase();

  // OpenAI quota / billing — retrying won't help until billing is fixed.
  // Example: "429 You exceeded your current quota, please check your plan and billing details."
  if (
    msg.includes("quota") ||
    msg.includes("insufficient_quota") ||
    msg.includes("billing")
  ) {
    return "permanent";
  }

  // Auth / permission — invalid or revoked API key.
  if (
    msg.includes("invalid api key") ||
    msg.includes("incorrect api key") ||
    msg.includes("authentication") ||
    msg.includes(" 401 ") ||
    msg.startsWith("401 ") ||
    msg.includes(" 403 ") ||
    msg.startsWith("403 ")
  ) {
    return "permanent";
  }

  // Parsing / validation errors — model returned data we can't use; same
  // input will produce the same broken output, so don't retry.
  if (
    msg.includes("validation failed") ||
    msg.includes("response validation failed") ||
    msg.includes("invalid date") ||
    msg.includes("invalid time value") ||
    msg.includes("parsing") ||
    msg.includes("json.parse")
  ) {
    return "permanent";
  }

  // Everything else (rate limit without quota, network, 5xx, timeouts):
  // transient — retry.
  return "transient";
}
