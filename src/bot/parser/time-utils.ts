/**
 * Date/time utilities for parser masks.
 * All arithmetic is done in UTC or via Intl to avoid local-timezone issues.
 */

/** Format a Date as "YYYY-MM-DD" in the given IANA timezone. */
export function formatDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Format a Date as "HH:MM" in the given IANA timezone. */
export function formatTime(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}`;
}

/** Add N minutes to a Date. */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Add N calendar days to a date, using UTC-noon as the base to avoid
 * DST and local-timezone boundary issues.
 *
 * Input: any Date.
 * Output: UTC noon on (input UTC date + N days).
 */
export function addDays(date: Date, days: number): Date {
  const ms = date.getTime() + days * 86_400_000;
  return new Date(ms);
}

/**
 * Return UTC noon of the given date in the given IANA timezone.
 * Using noon avoids ambiguity around midnight DST transitions.
 */
export function startOfDay(date: Date, timezone: string): Date {
  const dateStr = formatDate(date, timezone); // "YYYY-MM-DD" in user's timezone
  // Noon UTC on that calendar date — safe for any timezone (UTC offset max ±14h)
  return new Date(`${dateStr}T12:00:00Z`);
}

/**
 * Convert a local date+time in the given IANA timezone to a UTC Date.
 *
 * Algorithm:
 *   1. Treat the local datetime as if it were UTC (naïve UTC).
 *   2. Format that naïve UTC date in the target timezone to find what local time it maps to.
 *   3. Compute the difference → timezone offset at that instant.
 *   4. Subtract the offset to get the true UTC timestamp.
 *
 * This handles DST automatically because Intl uses the actual offset for that instant.
 */
export function localDateTimeToUtc(
  date: string,  // "YYYY-MM-DD"
  time: string,  // "HH:MM"
  timezone: string
): Date {
  // Step 1: interpret the local datetime as if it were UTC
  const naiveUtc = new Date(`${date}T${time}:00Z`);

  // Step 2: format naiveUtc in the target timezone
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(naiveUtc);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));

  // Step 3: compute what naiveUtc "looks like" in the target timezone as a UTC ms value
  const localAsUtcMs = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second
  );

  // offset = how far the target timezone is ahead of UTC at this instant
  const offsetMs = localAsUtcMs - naiveUtc.getTime();

  // Step 4: subtract the offset to get the true UTC timestamp
  return new Date(naiveUtc.getTime() - offsetMs);
}
