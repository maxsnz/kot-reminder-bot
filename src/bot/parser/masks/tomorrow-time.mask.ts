import type { Mask } from "./index";
import { formatDate, addDays, startOfDay } from "../time-utils";
import { ScheduleKind } from "../schedule-kind";

export const tomorrowTimeMask: Mask = {
  name: "tomorrow-time",

  match(tokens) {
    const date = tokens.find((t) => t.type === "DATE");
    return (
      date !== undefined &&
      date.type === "DATE" &&
      (date.date === "tomorrow" || date.date === "day_after_tomorrow") &&
      tokens.some((t) => t.type === "TIME") &&
      tokens.some((t) => t.type === "TEXT")
    );
  },

  build(tokens, userTimezone) {
    const date = tokens.find((t) => t.type === "DATE");
    const time = tokens.find((t) => t.type === "TIME");
    const text = tokens.find((t) => t.type === "TEXT");
    if (
      !date || date.type !== "DATE" ||
      !time || time.type !== "TIME" ||
      !text || text.type !== "TEXT"
    ) return null;

    const daysOffset = date.date === "tomorrow" ? 1 : 2;
    const targetDate = addDays(startOfDay(new Date(), userTimezone), daysOffset);
    const runAtDate = formatDate(targetDate, userTimezone);
    const runAtTime = `${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;

    const dateLabel = date.date === "tomorrow" ? "завтра" : "послезавтра";
    const timeSummary = `${dateLabel} в ${runAtTime}`;

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
        emoji: "📅",
        runAtDates: [runAtDate],
        runAtTimes: [runAtTime],
      },
    };
  },
};
