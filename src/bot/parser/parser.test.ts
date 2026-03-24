import { tokenize } from "./tokenizer";
import { findClosest } from "./fuzzy";
import { tryParseMessage } from "./index";

const TZ = "Europe/Moscow"; // UTC+3

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fixed "now": 2026-03-24 10:00 MSK = 07:00 UTC */
const FIXED_NOW = new Date("2026-03-24T07:00:00.000Z");

function withFixedNow(fn: () => void) {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
  try {
    fn();
  } finally {
    jest.useRealTimers();
  }
}

function oneTime(r: ReturnType<typeof tryParseMessage>) {
  if (!r.ok) throw new Error(`Expected ok:true, got: ${r.reason}`);
  const s = r.result.schedule;
  if (!s || s.kind !== "one_time") throw new Error("Expected one_time schedule");
  return s;
}

// ── fuzzy ─────────────────────────────────────────────────────────────────────

describe("fuzzy – findClosest", () => {
  const dict = ["завтра", "послезавтра", "понедельник", "минут", "часов"];

  test("exact match", () => {
    expect(findClosest("завтра", dict)).toBe("завтра");
  });

  test("distance 1 – missing letter", () => {
    expect(findClosest("зафтра", dict)).toBe("завтра");
  });

  test("distance 1 – extra letter", () => {
    expect(findClosest("завтрра", dict)).toBe("завтра");
  });

  test("distance 2 – long word", () => {
    expect(findClosest("послезавтрa", dict)).toBe("послезавтра");
  });

  test("no match beyond threshold", () => {
    expect(findClosest("среда", dict)).toBeNull();
  });
});

// ── tokenizer ─────────────────────────────────────────────────────────────────

describe("tokenizer", () => {
  describe("RELATIVE", () => {
    test("через 30 минут пицца", () => {
      const r = tokenize("через 30 минут пицца");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "RELATIVE", minutes: 30 });
      expect(r.tokens).toContainEqual({ type: "TEXT", value: "пицца" });
    });

    test("через 2 часа позвонить маме", () => {
      const r = tokenize("через 2 часа позвонить маме");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "RELATIVE", minutes: 120 });
    });

    test("fuzzy: чрез 30 минут пицца", () => {
      // "чрез" won't fuzzy-match "через" (too different) — should fall through to no_match
      const r = tokenize("чрез 30 минут пицца");
      // tokenizer won't find RELATIVE, but finds TEXT
      // (это edge case — приемлемо идти в LLM)
      expect(r.ok).toBe(true);
    });

    test("через 30 минут — без TEXT → no_text", () => {
      const r = tokenize("через 30 минут");
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("no_text");
    });
  });

  describe("DATE", () => {
    test("завтра", () => {
      const r = tokenize("завтра в 10:00 позвонить");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "DATE", date: "tomorrow" });
    });

    test("послезавтра", () => {
      const r = tokenize("послезавтра в 15:00 встреча");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "DATE", date: "day_after_tomorrow" });
    });

    test("fuzzy: зафтра → завтра", () => {
      const r = tokenize("зафтра в 10:00 позвонить");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "DATE", date: "tomorrow" });
    });

    test("в пятницу", () => {
      const r = tokenize("в пятницу в 18:00 встреча");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "DATE", date: "friday" });
    });

    test("в среду (форма 'среду')", () => {
      const r = tokenize("в среду в 12:00 обед");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "DATE", date: "wednesday" });
    });
  });

  describe("TIME", () => {
    test("в 14:00 → TIME(14, 0)", () => {
      const r = tokenize("в 14:00 забрать посылку");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "TIME", hours: 14, minutes: 0 });
    });

    test("в 8 утра → TIME(8, 0)", () => {
      const r = tokenize("в 8 утра позвонить");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "TIME", hours: 8, minutes: 0 });
    });

    test("в 8 вечера → TIME(20, 0)", () => {
      const r = tokenize("в 8 вечера позвонить");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "TIME", hours: 20, minutes: 0 });
    });

    test("в 14 (>12) → TIME(14, 0) без неоднозначности", () => {
      const r = tokenize("в 14 забрать посылку");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.tokens).toContainEqual({ type: "TIME", hours: 14, minutes: 0 });
    });

    test("в 8 (без уточнения) → ambiguous_time", () => {
      const r = tokenize("в 8 позвонить");
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("ambiguous_time");
    });
  });

  describe("TEXT / stop-words", () => {
    test("стоп-слова удаляются", () => {
      const r = tokenize("напомни мне завтра в 10:00 позвонить маме");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const text = r.tokens.find((t) => t.type === "TEXT");
      expect(text?.type === "TEXT" && text.value).not.toContain("напомни");
      expect(text?.type === "TEXT" && text.value).not.toContain("мне");
    });
  });
});

// ── tryParseMessage ───────────────────────────────────────────────────────────

describe("tryParseMessage", () => {
  describe("relative-time", () => {
    test("через 30 минут пицца", () => {
      withFixedNow(() => {
        const r = tryParseMessage("через 30 минут пицца", TZ);
        const s = oneTime(r);
        expect(s.message).toBe("пицца");
        expect(s.runAtTimes[0]).toBe("10:30");
      });
    });

    test("через 2 часа позвонить маме", () => {
      withFixedNow(() => {
        const r = tryParseMessage("через 2 часа позвонить маме", TZ);
        expect(oneTime(r).runAtTimes[0]).toBe("12:00");
      });
    });

    test("без текста → no_text", () => {
      const r = tryParseMessage("через 30 минут", TZ);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("no_text");
    });
  });

  describe("tomorrow-time", () => {
    test("завтра в 10:00 позвонить маме", () => {
      withFixedNow(() => {
        const r = tryParseMessage("завтра в 10:00 позвонить маме", TZ);
        const s = oneTime(r);
        expect(s.runAtDates[0]).toBe("2026-03-25");
        expect(s.runAtTimes[0]).toBe("10:00");
        expect(s.message).toContain("позвонить маме");
      });
    });

    test("послезавтра в 15:00 встреча", () => {
      withFixedNow(() => {
        const r = tryParseMessage("послезавтра в 15:00 встреча", TZ);
        const s = oneTime(r);
        expect(s.runAtDates[0]).toBe("2026-03-26");
        expect(s.runAtTimes[0]).toBe("15:00");
      });
    });

    test("fuzzy: зафтра в 10 позвонить", () => {
      withFixedNow(() => {
        const r = tryParseMessage("зафтра в 10:00 позвонить", TZ);
        expect(oneTime(r).runAtDates[0]).toBe("2026-03-25");
      });
    });
  });

  describe("today-time", () => {
    test("в 14:00 забрать посылку (время в будущем)", () => {
      withFixedNow(() => {
        // fixed now = 10:00, 14:00 is in the future
        const r = tryParseMessage("в 14:00 забрать посылку", TZ);
        const s = oneTime(r);
        expect(s.runAtDates[0]).toBe("2026-03-24");
        expect(s.runAtTimes[0]).toBe("14:00");
      });
    });

    test("в 9:00 забрать посылку (время в прошлом) → time_in_past", () => {
      withFixedNow(() => {
        // fixed now = 10:00, 9:00 is in the past
        const r = tryParseMessage("в 9:00 забрать посылку", TZ);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe("time_in_past");
      });
    });

    test("в 8 (без уточнения) → ambiguous_time", () => {
      const r = tryParseMessage("в 8 позвонить", TZ);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("ambiguous_time");
    });
  });

  describe("day-of-week", () => {
    test("в пятницу в 18:00 встреча (сегодня вторник 2026-03-24)", () => {
      withFixedNow(() => {
        const r = tryParseMessage("в пятницу в 18:00 встреча", TZ);
        const s = oneTime(r);
        // Next friday from 2026-03-24 (Tuesday) = 2026-03-27
        expect(s.runAtDates[0]).toBe("2026-03-27");
        expect(s.runAtTimes[0]).toBe("18:00");
      });
    });

    test("в понедельник в 9 утра зубной", () => {
      withFixedNow(() => {
        const r = tryParseMessage("в понедельник в 9 утра зубной", TZ);
        const s = oneTime(r);
        // Next monday from 2026-03-24 (Tuesday) = 2026-03-30
        expect(s.runAtDates[0]).toBe("2026-03-30");
        expect(s.runAtTimes[0]).toBe("09:00");
      });
    });
  });

  describe("edge cases", () => {
    test("пустая строка → no_text", () => {
      const r = tryParseMessage("", TZ);
      expect(r.ok).toBe(false);
    });

    test("только TEXT без времени → no_match", () => {
      const r = tryParseMessage("купить молоко", TZ);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("no_match");
    });

    test("только TIME без TEXT → no_text", () => {
      const r = tryParseMessage("в 14:00", TZ);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("no_text");
    });

    test("стоп-слова не считаются TEXT", () => {
      const r = tryParseMessage("напомни в 14:00", TZ);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("no_text");
    });
  });
});
