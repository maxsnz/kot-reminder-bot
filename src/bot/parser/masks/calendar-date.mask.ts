import type { Mask } from "./index";
import { formatDate, startOfDay } from "../time-utils";
import { ScheduleKind } from "../schedule-kind";

export const calendarDateMask: Mask = {
  name: "calendar-date",

  match(tokens) {
    return (
      tokens.some((t) => t.type === "CALENDAR_DATE") &&
      tokens.some((t) => t.type === "TIME") &&
      tokens.some((t) => t.type === "TEXT")
    );
  },

  build(tokens, userTimezone) {
    const calDate = tokens.find((t) => t.type === "CALENDAR_DATE");
    const time = tokens.find((t) => t.type === "TIME");
    const text = tokens.find((t) => t.type === "TEXT");
    if (
      !calDate || calDate.type !== "CALENDAR_DATE" ||
      !time || time.type !== "TIME" ||
      !text || text.type !== "TEXT"
    ) return null;

    const todayStr = formatDate(new Date(), userTimezone); // "YYYY-MM-DD"
    const currentYear = parseInt(todayStr.substring(0, 4), 10);

    const monthStr = String(calDate.month).padStart(2, "0");
    const dayStr = String(calDate.day).padStart(2, "0");

    let year = currentYear;
    let runAtDate = `${year}-${monthStr}-${dayStr}`;

    // If the date has already passed this year, roll to next year
    if (runAtDate < todayStr) {
      year++;
      runAtDate = `${year}-${monthStr}-${dayStr}`;
    }

    // Validate the date is real (e.g. not Feb 30)
    const check = new Date(`${runAtDate}T12:00:00Z`);
    if (
      check.getUTCMonth() + 1 !== calDate.month ||
      check.getUTCDate() !== calDate.day
    ) return null;

    const runAtTime = `${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;

    // Human-readable date label
    const MONTH_NAMES: Record<number, string> = {
      1: "января", 2: "февраля", 3: "марта", 4: "апреля",
      5: "мая", 6: "июня", 7: "июля", 8: "августа",
      9: "сентября", 10: "октября", 11: "ноября", 12: "декабря",
    };
    const dateLabel = `${calDate.day} ${MONTH_NAMES[calDate.month]}`;
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
