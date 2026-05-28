import { classifyAiError } from "./classifyAiError";

describe("classifyAiError", () => {
  describe("permanent", () => {
    test.each([
      "429 You exceeded your current quota, please check your plan and billing details.",
      "insufficient_quota",
      "Your billing account is suspended",
      "401 Invalid API key",
      "Incorrect API key provided",
      "Authentication error",
      "403 Forbidden",
      "Response validation failed: unrecognized_keys",
      "Invalid date: 2026-13-01",
      "Invalid time value",
      "JSON.parse: unexpected character",
      "parsing error in AI response",
    ])("permanent: %s", (msg) => {
      expect(classifyAiError(msg)).toBe("permanent");
    });
  });

  describe("transient", () => {
    test.each([
      "429 Rate limit exceeded, please retry",
      "fetch failed",
      "ECONNRESET",
      "Connection timeout",
      "500 Internal Server Error",
      "503 Service Unavailable",
      "AbortError",
      "",
      "Some unknown error we haven't catalogued",
    ])("transient: %s", (msg) => {
      expect(classifyAiError(msg)).toBe("transient");
    });
  });
});
