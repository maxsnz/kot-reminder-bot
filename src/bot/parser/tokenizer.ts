import {
  findClosest,
  DATE_KEYWORDS,
  DATE_DICTIONARY,
  TIME_WORD_KEYWORDS,
  TIME_WORD_DICTIONARY,
  DURATION_UNIT_KEYWORDS,
  DURATION_UNIT_DICTIONARY,
  MONTH_KEYWORDS,
  MONTH_DICTIONARY,
  STOP_WORDS,
} from "./fuzzy";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type DateValue = "today" | "tomorrow" | "day_after_tomorrow" | DayOfWeek;

export type Token =
  | { type: "RELATIVE"; minutes: number }
  | { type: "DATE"; date: DateValue }
  | { type: "CALENDAR_DATE"; day: number; month: number }
  | { type: "TIME"; hours: number; minutes: number }
  | { type: "TEXT"; value: string };

// ── Number words ──────────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  один: 1, одну: 1, одна: 1,
  два: 2, две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
};

function parseNumberWord(word: string): number | null {
  return NUMBER_WORDS[word] ?? null;
}

// ── Normalize ─────────────────────────────────────────────────────────────────

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/(?<=\s|^)[-–—]+(?=\s|$)/g, "") // дефисы и тире как разделители → убрать
    .replace(/\s+/g, " ")
    .trim();
}

// ── RELATIVE token ────────────────────────────────────────────────────────────
// Matches: "через 30 минут", "через 2 часа", "через час"

const RELATIVE_REGEX = /через\s+(\d+|[а-яё]+)\s+([а-яё]+)/;

export function extractRelative(text: string): { token: Token & { type: "RELATIVE" }; rest: string } | null {
  const match = text.match(RELATIVE_REGEX);
  if (!match) return null;

  const rawAmount = match[1];
  const rawUnit = match[2];

  let amount = parseInt(rawAmount, 10);
  if (isNaN(amount)) {
    const fromWord = parseNumberWord(rawAmount);
    if (fromWord === null) return null;
    amount = fromWord;
  }

  const unit =
    DURATION_UNIT_KEYWORDS[rawUnit] ??
    (() => {
      const closest = findClosest(rawUnit, DURATION_UNIT_DICTIONARY);
      return closest ? DURATION_UNIT_KEYWORDS[closest] : null;
    })();

  if (!unit) return null;

  let minutes: number;
  if (unit === "minutes") minutes = amount;
  else if (unit === "hours") minutes = amount * 60;
  else minutes = amount * 60 * 24;

  const rest = text.replace(match[0], "").replace(/\s+/g, " ").trim();
  return { token: { type: "RELATIVE", minutes }, rest };
}

// ── DATE token ────────────────────────────────────────────────────────────────
// Matches: "завтра", "в пятницу", "во вторник", etc.

const IN_DAY_REGEX = /\b(?:во?\s+)?([а-яё]+(?:день)?)\b/g;

export function extractDate(text: string): { token: Token & { type: "DATE" }; rest: string } | null {
  // Try each word (and "в/во + word" combos)
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // direct match
    let dateVal = DATE_KEYWORDS[word];
    if (!dateVal) {
      const closest = findClosest(word, DATE_DICTIONARY);
      if (closest) dateVal = DATE_KEYWORDS[closest];
    }
    if (dateVal) {
      // Remove by index to avoid deleting duplicate words (e.g. two "в" in "в пятницу в 18:00")
      const removedIndices = new Set([i]);
      if (i > 0 && (words[i - 1] === "в" || words[i - 1] === "во")) {
        removedIndices.add(i - 1);
      }
      const rest = words.filter((_, idx) => !removedIndices.has(idx)).join(" ").trim();
      return { token: { type: "DATE", date: dateVal as DateValue }, rest };
    }
  }
  return null;
}

// ── CALENDAR_DATE token ───────────────────────────────────────────────────────
// Matches: "23 июня", "5 марта", "1-го января"

const CALENDAR_DATE_REGEX = /(?<!\d)(\d{1,2})(?:-?го)?\s+([а-яё]+)/;

export function extractCalendarDate(text: string): { token: Token & { type: "CALENDAR_DATE" }; rest: string } | null {
  const match = text.match(CALENDAR_DATE_REGEX);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  if (day < 1 || day > 31) return null;

  const rawMonth = match[2];
  const month =
    MONTH_KEYWORDS[rawMonth] ??
    (() => {
      const closest = findClosest(rawMonth, MONTH_DICTIONARY);
      return closest ? MONTH_KEYWORDS[closest] : null;
    })();

  if (!month) return null;

  const rest = text.replace(match[0], "").replace(/\s+/g, " ").trim();
  return { token: { type: "CALENDAR_DATE", day, month }, rest };
}

// ── TIME token ────────────────────────────────────────────────────────────────
// Matches: "в 10:00", "в 14", "в 8 утра", "в 8 вечера", "утром", "вечером"
// Ambiguous: "в 8" without am/pm qualifier → returns null

// Use Unicode-aware lookbehind: \p{L} matches any Unicode letter (including Cyrillic),
// so (?<!\p{L})в ensures we match preposition "в" not inside a word like "нарисовав".
const HH_MM_REGEX = /(?<!\p{L})в\s+(\d{1,2}):(\d{2})/u;
const H_ONLY_REGEX = /(?<!\p{L})в\s+(\d{1,2})(?![\d:])/u;

export function extractTime(text: string): { token: Token & { type: "TIME" }; rest: string; ambiguous?: boolean } | null {
  // 1. Full "в HH:MM"
  let match = text.match(HH_MM_REGEX);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours > 23 || minutes > 59) return null;
    const rest = text.replace(match[0], "").replace(/\s+/g, " ").trim();
    return { token: { type: "TIME", hours, minutes }, rest };
  }

  // 2. "в X утра/вечера/..." — look for number followed by time qualifier
  const H_WITH_QUALIFIER = /(?<!\p{L})в\s+(\d{1,2})\s+([а-яё]+)/u;
  match = text.match(H_WITH_QUALIFIER);
  if (match) {
    const rawHour = parseInt(match[1], 10);
    const qualifier = match[2];
    const timeWord =
      TIME_WORD_KEYWORDS[qualifier] ??
      (() => {
        const closest = findClosest(qualifier, TIME_WORD_DICTIONARY);
        return closest ? TIME_WORD_KEYWORDS[closest] : null;
      })();

    if (timeWord && timeWord !== "am" && timeWord !== "pm") {
      // exact word like "полдень" / "полночь" — ignore the number
      const rest = text.replace(match[0], "").replace(/\s+/g, " ").trim();
      return { token: { type: "TIME", hours: timeWord.hours, minutes: timeWord.minutes }, rest };
    }
    if (timeWord === "am" || timeWord === "pm") {
      let hours = rawHour;
      if (timeWord === "pm" && hours < 12) hours += 12;
      if (timeWord === "am" && hours === 12) hours = 0;
      if (hours > 23) return null;
      const rest = text.replace(match[0], "").replace(/\s+/g, " ").trim();
      return { token: { type: "TIME", hours, minutes: 0 }, rest };
    }
  }

  // 3. Standalone time words "утром", "вечером", etc.
  const words = text.split(/\s+/);
  for (const word of words) {
    const timeWord =
      TIME_WORD_KEYWORDS[word] ??
      (() => {
        const closest = findClosest(word, TIME_WORD_DICTIONARY);
        return closest ? TIME_WORD_KEYWORDS[closest] : null;
      })();
    if (timeWord && timeWord !== "am" && timeWord !== "pm") {
      const rest = text.replace(word, "").replace(/\s+/g, " ").trim();
      return { token: { type: "TIME", hours: timeWord.hours, minutes: timeWord.minutes }, rest };
    }
    // "утром" / "вечером" standalone — ambiguous without a specific hour
    if (timeWord === "am" || timeWord === "pm") {
      // can't pin to a specific hour → fallback to LLM
      return null;
    }
  }

  // 4. "в X" — bare number, check if unambiguous (>12 → PM-only)
  match = text.match(H_ONLY_REGEX);
  if (match) {
    const rawHour = parseInt(match[1], 10);
    if (rawHour > 12) {
      // unambiguously 13–23
      const rest = text.replace(match[0], "").replace(/\s+/g, " ").trim();
      return { token: { type: "TIME", hours: rawHour, minutes: 0 }, rest };
    }
    // ambiguous (1–12) — signal caller
    return { token: { type: "TIME", hours: rawHour, minutes: 0 }, rest: text, ambiguous: true };
  }

  return null;
}

// ── TEXT token ────────────────────────────────────────────────────────────────

function extractText(text: string): (Token & { type: "TEXT" }) | null {
  const words = text
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  if (words.length === 0) return null;
  return { type: "TEXT", value: words.join(" ") };
}

// ── Main tokenizer ────────────────────────────────────────────────────────────

export type TokenizerResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; reason: "ambiguous_time" | "no_text" };

export function tokenize(input: string): TokenizerResult {
  let text = normalize(input);
  const tokens: Token[] = [];

  // 1. RELATIVE
  const relative = extractRelative(text);
  if (relative) {
    tokens.push(relative.token);
    text = relative.rest;
  }

  // 2. DATE (only if no RELATIVE)
  if (!relative) {
    const date = extractDate(text);
    if (date) {
      tokens.push(date.token);
      text = date.rest;
    } else {
      const calDate = extractCalendarDate(text);
      if (calDate) {
        tokens.push(calDate.token);
        text = calDate.rest;
      }
    }
  }

  // 3. TIME (only if no RELATIVE)
  if (!relative) {
    const time = extractTime(text);
    if (time) {
      if (time.ambiguous) return { ok: false, reason: "ambiguous_time" };
      tokens.push(time.token);
      text = time.rest;
    }
  }

  // 4. TEXT (remainder)
  const textToken = extractText(text);
  if (!textToken) return { ok: false, reason: "no_text" };
  tokens.push(textToken);

  return { ok: true, tokens };
}
