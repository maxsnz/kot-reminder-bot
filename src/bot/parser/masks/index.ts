import type { Token } from "../tokenizer";
import type { ScheduleKind } from "../schedule-kind";

/** Minimal type for what a mask's build() must return. Compatible with ResultCreateSchedule. */
export interface ParsedResult {
  action: "create_schedule";
  focus: "new" | "current";
  response: string;
  schedule: {
    kind: ScheduleKind;
    message: string;
    summary: string;
    timeSummary: string;
    actionSummary: string;
    emoji: string;
    runAtDates: string[];
    runAtTimes: string[];
  };
}

export interface Mask {
  name: string;
  /** Returns true if this mask can handle the given token set. */
  match(tokens: Token[]): boolean;
  /**
   * Builds a ParsedResult payload.
   * Returns null if the tokens don't have enough data (triggers LLM fallback).
   */
  build(tokens: Token[], userTimezone: string): ParsedResult | null;
}

import { relativeTimeMask } from "./relative-time.mask";
import { tomorrowTimeMask } from "./tomorrow-time.mask";
import { calendarDateMask } from "./calendar-date.mask";
import { dayOfWeekMask } from "./day-of-week.mask";
import { todayTimeMask } from "./today-time.mask";

/**
 * Masks ordered from most specific to least specific.
 * The first matching mask wins.
 *
 * To add a new mask:
 * 1. Create src/bot/parser/masks/my-mask.mask.ts implementing Mask
 * 2. Import it here and add to the list in the right position
 * 3. Add tests in parser.test.ts
 */
export const MASKS: Mask[] = [
  relativeTimeMask,    // "через X минут/часов"
  tomorrowTimeMask,    // "завтра / послезавтра в HH:MM"
  calendarDateMask,    // "23 июня в HH:MM"
  dayOfWeekMask,       // "в пятницу в HH:MM"
  todayTimeMask,       // "в HH:MM" (сегодня)
];

export function findMask(tokens: Token[]): Mask | null {
  return MASKS.find((m) => m.match(tokens)) ?? null;
}
