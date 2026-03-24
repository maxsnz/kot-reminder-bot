import type { Mask } from "./index";
import { formatDate } from "../time-utils";
import { ScheduleKind } from "../schedule-kind";

export const todayTimeMask: Mask = {
  name: "today-time",

  match(tokens) {
    const hasExplicitToday =
      tokens.some((t) => t.type === "DATE" && t.date === "today");
    const hasTime = tokens.some((t) => t.type === "TIME");
    const hasText = tokens.some((t) => t.type === "TEXT");
    const hasNoOtherDate = !tokens.some(
      (t) => t.type === "DATE" && t.date !== "today"
    );
    return hasTime && hasText && hasNoOtherDate && (hasExplicitToday || true);
  },

  build(tokens, userTimezone) {
    const time = tokens.find((t) => t.type === "TIME");
    const text = tokens.find((t) => t.type === "TEXT");
    if (!time || time.type !== "TIME" || !text || text.type !== "TEXT") return null;

    const now = new Date();
    const runAtDate = formatDate(now, userTimezone);
    const runAtTime = `${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;

    const timeSummary = `сегодня в ${runAtTime}`;

    return {
      action: "create_schedule",
      focus: "new",
      response: "",
      schedule: {
        kind: ScheduleKind.one_time,
        message: text.value,
        summary: `напомнить ${text.value} ${timeSummary}`,
        timeSummary,
        actionSummary: text.value,
        emoji: "📌",
        runAtDates: [runAtDate],
        runAtTimes: [runAtTime],
      },
    };
  },
};
