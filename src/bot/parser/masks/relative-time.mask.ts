import type { Mask } from "./index";
import { formatDate, formatTime, addMinutes } from "../time-utils";
import { ScheduleKind } from "../schedule-kind";

export const relativeTimeMask: Mask = {
  name: "relative-time",

  match(tokens) {
    return tokens.some((t) => t.type === "RELATIVE") && tokens.some((t) => t.type === "TEXT");
  },

  build(tokens, userTimezone) {
    const relative = tokens.find((t) => t.type === "RELATIVE");
    const text = tokens.find((t) => t.type === "TEXT");
    if (!relative || relative.type !== "RELATIVE" || !text || text.type !== "TEXT") return null;

    const runAt = addMinutes(new Date(), relative.minutes);
    const runAtDate = formatDate(runAt, userTimezone);
    const runAtTime = formatTime(runAt, userTimezone);

    const timeSummary = `через ${describeMinutes(relative.minutes)}`;

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
        emoji: "⏰",
        runAtDates: [runAtDate],
        runAtTimes: [runAtTime],
      },
    };
  },
};

function describeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} ${pluralMinutes(minutes)}`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} ${pluralHours(hours)}`;
  return `${hours} ${pluralHours(hours)} ${mins} ${pluralMinutes(mins)}`;
}

function pluralMinutes(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "минуту";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "минуты";
  return "минут";
}

function pluralHours(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "час";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "часа";
  return "часов";
}
