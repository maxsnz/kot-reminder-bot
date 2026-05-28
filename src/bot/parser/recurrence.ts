/**
 * Detects whether user text expresses a recurring schedule.
 *
 * The parser only handles one-time reminders. Anything recurring
 * ("каждый день в 15:30", "по понедельникам", "ежедневно") must fall
 * back to the LLM, which can build a proper recurring Schedule.
 *
 * Detection is intentionally cheap and word-based — Cyrillic `\b` in
 * JS regex is unreliable, so we split on whitespace/punctuation and
 * check each token.
 */

const RECURRENCE_ADVERBS = new Set([
  "ежедневно",
  "еженедельно",
  "ежемесячно",
  "ежегодно",
  "ежечасно",
  "ежеминутно",
]);

// Plural forms that follow "по" to express recurrence: "по понедельникам",
// "по будням", "по утрам", etc.
const PLURAL_RECURRENCE_TARGETS = new Set([
  // weekdays / day groups
  "будням",
  "выходным",
  "понедельникам",
  "вторникам",
  "средам",
  "четвергам",
  "пятницам",
  "субботам",
  "воскресеньям",
  // times of day
  "утрам",
  "вечерам",
  "ночам",
  "дням",
]);

export function hasRecurrenceMarker(text: string): boolean {
  const words = text
    .toLowerCase()
    .split(/[\s,.\-–—!?;:()"«»]+/)
    .filter(Boolean);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // "каждый / каждая / каждое / каждую / каждые / каждых / каждом / ..."
    // All forms start with "кажд" and have ≥2 chars of suffix.
    if (word.startsWith("кажд") && word.length >= 6) return true;

    // "ежедневно", "еженедельно", ...
    if (RECURRENCE_ADVERBS.has(word)) return true;

    // "по будням", "по понедельникам", "по утрам", ...
    if (word === "по" && i + 1 < words.length) {
      if (PLURAL_RECURRENCE_TARGETS.has(words[i + 1])) return true;
    }
  }

  return false;
}
