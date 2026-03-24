import { tokenize } from "./tokenizer";
import { findMask } from "./masks/index";
import { localDateTimeToUtc } from "./time-utils";
import type { ParsedResult } from "./masks/index";

export type { ParsedResult };

export type TryParseResult =
  | { ok: true; result: ParsedResult }
  | { ok: false; reason: "no_text" | "no_match" | "ambiguous_time" | "time_in_past" | "build_failed" };

/**
 * Try to parse a user message without calling LLM.
 *
 * Returns ok:true with a ParsedResult on success.
 * Returns ok:false with a reason on any failure — caller should fall back to LLM
 * (except "no_text" which should reply "Уточните запрос" without LLM).
 */
export function tryParseMessage(
  text: string,
  userTimezone: string
): TryParseResult {
  const tokenized = tokenize(text);

  if (!tokenized.ok) {
    return { ok: false, reason: tokenized.reason };
  }

  const { tokens } = tokenized;

  const mask = findMask(tokens);
  if (!mask) {
    return { ok: false, reason: "no_match" };
  }

  const result = mask.build(tokens, userTimezone);
  if (!result) {
    return { ok: false, reason: "build_failed" };
  }

  // Validate that scheduled time is in the future (timezone-aware)
  const { runAtDates, runAtTimes } = result.schedule;
  if (runAtDates.length > 0 && runAtTimes.length > 0) {
    const scheduledMs = localDateTimeToUtc(runAtDates[0], runAtTimes[0], userTimezone).getTime();
    if (scheduledMs <= Date.now()) {
      return { ok: false, reason: "time_in_past" };
    }
  }

  return { ok: true, result };
}
