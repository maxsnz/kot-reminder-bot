import type { Mask } from "./index";
import type { DayOfWeek } from "../tokenizer";
import { formatDate, addDays } from "../time-utils";
import { ScheduleKind } from "../schedule-kind";

const DAY_INDEX: Record<DayOfWeek, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

const DAY_LABEL: Record<DayOfWeek, string> = {
  monday: "в понедельник",
  tuesday: "во вторник",
  wednesday: "в среду",
  thursday: "в четверг",
  friday: "в пятницу",
  saturday: "в субботу",
  sunday: "в воскресенье",
};

const DAYS_OF_WEEK: DayOfWeek[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

function nextWeekday(dayOfWeek: DayOfWeek, userTimezone: string): Date {
  const now = new Date();
  // Get today's date string in user timezone, then parse the weekday from it
  const todayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: userTimezone,
    weekday: "short",
  }).format(now);
  // en-US short weekday: Sun, Mon, Tue, Wed, Thu, Fri, Sat (index 0–6)
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayIndex = weekdays.indexOf(todayStr);

  const target = DAY_INDEX[dayOfWeek];
  let daysUntil = (target - todayIndex + 7) % 7;
  if (daysUntil === 0) daysUntil = 7; // same weekday → next week

  return addDays(now, daysUntil);
}

export const dayOfWeekMask: Mask = {
  name: "day-of-week",

  match(tokens) {
    const date = tokens.find((t) => t.type === "DATE");
    return (
      date !== undefined &&
      date.type === "DATE" &&
      (DAYS_OF_WEEK as string[]).includes(date.date) &&
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

    const dayOfWeek = date.date as DayOfWeek;
    const targetDate = nextWeekday(dayOfWeek, userTimezone);
    const runAtDate = formatDate(targetDate, userTimezone);
    const runAtTime = `${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;
    const dateLabel = DAY_LABEL[dayOfWeek];
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
