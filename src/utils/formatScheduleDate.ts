import { Schedule, ScheduleKind } from "@/prisma/generated/client";
import { parseLocalDateTimeInTimezone } from "./getNextRunAt";
import { logger } from "@/utils/logger";

/**
 * Formats a date/time in Russian locale with day of week
 * Example: "28 сентября 2025 г. (в четверг) в 17:00"
 */
export function formatScheduleDate(
  schedule: Schedule,
  timezone: string
): string {
  // For recurring schedules, use timeSummary if available
  if (schedule.kind === ScheduleKind.recurring && schedule.timeSummary) {
    return schedule.timeSummary;
  }

  // For one_time schedules, format the first date/time
  if (
    schedule.kind === ScheduleKind.one_time &&
    schedule.runAtDates.length > 0 &&
    schedule.runAtTimes.length > 0
  ) {
    const firstDate = schedule.runAtDates[0];
    const firstTime = schedule.runAtTimes[0];

    try {
      // Parse the date/time in the user's timezone
      const dateObj = parseLocalDateTimeInTimezone(
        firstDate,
        firstTime,
        timezone
      );

      // Format in Russian locale
      const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
        timeZone: timezone,
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });

      const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const dateParts = dateFormatter.formatToParts(dateObj);
      const timeParts = timeFormatter.formatToParts(dateObj);

      const day = dateParts.find((p) => p.type === "day")?.value || "";
      const month = dateParts.find((p) => p.type === "month")?.value || "";
      const year = dateParts.find((p) => p.type === "year")?.value || "";
      const weekday = dateParts.find((p) => p.type === "weekday")?.value || "";

      const hour = timeParts.find((p) => p.type === "hour")?.value || "";
      const minute = timeParts.find((p) => p.type === "minute")?.value || "";

      // Format: "28 сентября 2025 г. (в четверг) в 17:00"
      return `${day} ${month} ${year} г. (в ${weekday}) в ${hour}:${minute}`;
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          scheduleId: schedule.id,
          timezone,
        },
        "Error formatting schedule date"
      );
      // Fallback to timeSummary if available
      return schedule.timeSummary || `${firstDate} в ${firstTime}`;
    }
  }

  // Fallback to timeSummary
  return schedule.timeSummary || "Дата не указана";
}
