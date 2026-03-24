/**
 * Fuzzy matching for Russian temporal keywords using Levenshtein distance.
 */

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function maxDistanceFor(word: string): number {
  if (word.length <= 4) return 1;
  if (word.length <= 8) return 1;
  return 2;
}

export function findClosest(
  input: string,
  dictionary: string[]
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  const maxDist = maxDistanceFor(input);

  for (const word of dictionary) {
    const dist = levenshtein(input, word);
    if (dist <= maxDist && dist < bestDist) {
      best = word;
      bestDist = dist;
    }
  }
  return best;
}

// ── Dictionaries ─────────────────────────────────────────────────────────────

export const DATE_KEYWORDS: Record<string, string> = {
  сегодня: "today",
  завтра: "tomorrow",
  послезавтра: "day_after_tomorrow",
  понедельник: "monday",
  вторник: "tuesday",
  среда: "wednesday",
  среду: "wednesday",
  четверг: "thursday",
  пятница: "friday",
  пятницу: "friday",
  суббота: "saturday",
  субботу: "saturday",
  воскресенье: "sunday",
};

export const DATE_DICTIONARY = Object.keys(DATE_KEYWORDS);

export const TIME_WORD_KEYWORDS: Record<string, { hours: number; minutes: number } | "am" | "pm"> = {
  утром: "am",
  утра: "am",
  вечером: "pm",
  вечера: "pm",
  днём: "pm",
  дня: "pm",
  ночью: "am", // интерпретируем как раннее утро (0-5 диапазон)
  ночи: "am",
  полдень: { hours: 12, minutes: 0 },
  полночь: { hours: 0, minutes: 0 },
};

export const TIME_WORD_DICTIONARY = Object.keys(TIME_WORD_KEYWORDS);

export const DURATION_UNIT_KEYWORDS: Record<string, "minutes" | "hours" | "days"> = {
  минута: "minutes",
  минуту: "minutes",
  минуты: "minutes",
  минут: "minutes",
  минутку: "minutes",
  минутки: "minutes",
  минуток: "minutes",
  мин: "minutes",
  час: "hours",
  часа: "hours",
  часов: "hours",
  день: "days",
  дня: "days",
  дней: "days",
};

export const DURATION_UNIT_DICTIONARY = Object.keys(DURATION_UNIT_KEYWORDS);

export const MONTH_KEYWORDS: Record<string, number> = {
  // genitive (most common: "23 июня")
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
  // nominative
  январь: 1, февраль: 2, март: 3, апрель: 4, май: 5, июнь: 6,
  июль: 7, август: 8, сентябрь: 9, октябрь: 10, ноябрь: 11, декабрь: 12,
  // abbreviations
  янв: 1, фев: 2, февр: 2, мар: 3, апр: 4,
  июн: 6, июл: 7, авг: 8, сен: 9, сент: 9, окт: 10, ноя: 11, нояб: 11, дек: 12,
};

export const MONTH_DICTIONARY = Object.keys(MONTH_KEYWORDS);

export const STOP_WORDS = new Set([
  "напомни",
  "напоминай",
  "поставь",
  "напоминание",
  "создай",
  "добавь",
  "скажи",
  "мне",
  "пожалуйста",
  "пж",
]);
