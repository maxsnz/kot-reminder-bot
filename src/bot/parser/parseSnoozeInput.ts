import {
  normalize,
  extractRelative,
  extractDate,
  extractCalendarDate,
  extractTime,
} from "./tokenizer.js";
import { formatDate, addDays, startOfDay, localDateTimeToUtc } from "./time-utils.js";
import type { DayOfWeek } from "./tokenizer.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ParseSnoozeResult =
  | { ok: true; runAt: Date }
  | { ok: false; reason: "no_match" | "time_in_past" | "ambiguous_time" };

// ── Helpers ────────────────────────────────────────────────────────────────────

const DAY_INDEX: Record<DayOfWeek, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

function nextWeekdayDate(dayOfWeek: DayOfWeek, timezone: string, now: Date): Date {
  const todayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(now);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayIndex = weekdays.indexOf(todayStr);
  const target = DAY_INDEX[dayOfWeek];
  let daysUntil = (target - todayIndex + 7) % 7;
  if (daysUntil === 0) daysUntil = 7; // same weekday → next week
  return addDays(now, daysUntil);
}

function padTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const DAYS_OF_WEEK: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

// ── Main parser ────────────────────────────────────────────────────────────────

/**
 * Parse a user's custom snooze input into a UTC runAt Date.
 * Handles:
 *   - "через 5 часов", "через 30 минут"         → relative offset from now
 *   - "5 часов", "2 часа", "30 минут"            → same (bare duration without "через")
 *   - "завтра"                                   → exactly +24h from now
 *   - "послезавтра"                              → exactly +48h from now
 *   - "завтра в 10 утра", "послезавтра в 14"    → next day at specific time (timezone-aware)
 *   - "в пятницу в 18:00"                       → next occurrence of weekday at time
 *   - "23 июня в 10"                            → calendar date at time
 *   - "в 14:00", "в 9 утра"                     → today at that time
 */
export function parseSnoozeInput(text: string, timezone: string, now: Date): ParseSnoozeResult {
  const norm = normalize(text);

  // ── 1. RELATIVE: "через X часов" ────────────────────────────────────────────
  const rel = extractRelative(norm);
  if (rel) {
    const runAt = new Date(now.getTime() + rel.token.minutes * 60_000);
    if (runAt <= now) return { ok: false, reason: "time_in_past" };
    return { ok: true, runAt };
  }

  // ── 2. Bare duration: "5 часов", "2 часа" (without "через") ─────────────────
  // Prepend "через" to try matching as relative duration
  const relWithPrefix = extractRelative("через " + norm);
  if (relWithPrefix && relWithPrefix.rest.trim() === "") {
    const runAt = new Date(now.getTime() + relWithPrefix.token.minutes * 60_000);
    if (runAt <= now) return { ok: false, reason: "time_in_past" };
    return { ok: true, runAt };
  }

  // ── 3. DATE token ─────────────────────────────────────────────────────────────
  const dateResult = extractDate(norm);
  if (dateResult) {
    const { token: dateToken, rest: afterDate } = dateResult;

    // Check for TIME
    const timeResult = extractTime(afterDate);
    if (timeResult?.ambiguous) return { ok: false, reason: "ambiguous_time" };

    if (!timeResult) {
      // DATE without time
      if (dateToken.date === "tomorrow") {
        return { ok: true, runAt: new Date(now.getTime() + 24 * 60 * 60_000) };
      }
      if (dateToken.date === "day_after_tomorrow") {
        return { ok: true, runAt: new Date(now.getTime() + 48 * 60 * 60_000) };
      }
      // Day of week without time — ambiguous
      return { ok: false, reason: "no_match" };
    }

    // DATE + TIME
    const timeStr = padTime(timeResult.token.hours, timeResult.token.minutes);

    if (dateToken.date === "tomorrow" || dateToken.date === "day_after_tomorrow") {
      const daysOffset = dateToken.date === "tomorrow" ? 1 : 2;
      const targetDate = addDays(startOfDay(now, timezone), daysOffset);
      const dateStr = formatDate(targetDate, timezone);
      const runAt = localDateTimeToUtc(dateStr, timeStr, timezone);
      if (runAt <= now) return { ok: false, reason: "time_in_past" };
      return { ok: true, runAt };
    }

    if (dateToken.date === "today") {
      const dateStr = formatDate(now, timezone);
      const runAt = localDateTimeToUtc(dateStr, timeStr, timezone);
      if (runAt <= now) return { ok: false, reason: "time_in_past" };
      return { ok: true, runAt };
    }

    // Day of week
    if ((DAYS_OF_WEEK as string[]).includes(dateToken.date)) {
      const targetDate = nextWeekdayDate(dateToken.date as DayOfWeek, timezone, now);
      const dateStr = formatDate(targetDate, timezone);
      const runAt = localDateTimeToUtc(dateStr, timeStr, timezone);
      if (runAt <= now) return { ok: false, reason: "time_in_past" };
      return { ok: true, runAt };
    }
  }

  // ── 4. CALENDAR_DATE + TIME ───────────────────────────────────────────────────
  const calResult = extractCalendarDate(norm);
  if (calResult) {
    const { token: calToken, rest: afterCal } = calResult;
    const timeResult = extractTime(afterCal);
    if (timeResult?.ambiguous) return { ok: false, reason: "ambiguous_time" };
    if (!timeResult) return { ok: false, reason: "no_match" };

    const todayStr = formatDate(now, timezone);
    const currentYear = parseInt(todayStr.substring(0, 4), 10);
    const monthStr = String(calToken.month).padStart(2, "0");
    const dayStr = String(calToken.day).padStart(2, "0");
    let year = currentYear;
    let dateStr = `${year}-${monthStr}-${dayStr}`;
    if (dateStr < todayStr) {
      year++;
      dateStr = `${year}-${monthStr}-${dayStr}`;
    }

    // Validate the date (e.g. not Feb 30)
    const check = new Date(`${dateStr}T12:00:00Z`);
    if (check.getUTCMonth() + 1 !== calToken.month || check.getUTCDate() !== calToken.day) {
      return { ok: false, reason: "no_match" };
    }

    const timeStr = padTime(timeResult.token.hours, timeResult.token.minutes);
    const runAt = localDateTimeToUtc(dateStr, timeStr, timezone);
    if (runAt <= now) return { ok: false, reason: "time_in_past" };
    return { ok: true, runAt };
  }

  // ── 5. Just TIME (today) ─────────────────────────────────────────────────────
  const timeOnly = extractTime(norm);
  if (timeOnly) {
    if (timeOnly.ambiguous) return { ok: false, reason: "ambiguous_time" };
    const dateStr = formatDate(now, timezone);
    const timeStr = padTime(timeOnly.token.hours, timeOnly.token.minutes);
    const runAt = localDateTimeToUtc(dateStr, timeStr, timezone);
    if (runAt <= now) return { ok: false, reason: "time_in_past" };
    return { ok: true, runAt };
  }

  return { ok: false, reason: "no_match" };
}
