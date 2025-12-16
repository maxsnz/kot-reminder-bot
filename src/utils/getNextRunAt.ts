import {
  Schedule,
  ScheduleKind,
  ScheduleFrequency,
  StatusKind,
} from "@/prisma/generated/client";

/**
 * Converts a local date-time in a timezone to a UTC Date object
 * Uses iterative approach to find the correct UTC time
 */
export function parseLocalDateTimeInTimezone(
  dateStr: string,
  timeStr: string,
  timezone: string
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Start with an approximate UTC date
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Refine by checking what it formats to in the timezone
  for (let i = 0; i < 20; i++) {
    const parts = formatter.formatToParts(candidate);
    const cYear = parseInt(parts.find((p) => p.type === "year")?.value || "0");
    const cMonth = parseInt(
      parts.find((p) => p.type === "month")?.value || "0"
    );
    const cDay = parseInt(parts.find((p) => p.type === "day")?.value || "0");
    const cHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
    const cMinute = parseInt(
      parts.find((p) => p.type === "minute")?.value || "0"
    );

    if (
      cYear === year &&
      cMonth === month &&
      cDay === day &&
      cHour === hour &&
      cMinute === minute
    ) {
      return candidate;
    }

    // Calculate adjustment needed (in milliseconds)
    const yearDiff = (year - cYear) * 365 * 24 * 60 * 60 * 1000;
    const monthDiff = (month - cMonth) * 30 * 24 * 60 * 60 * 1000;
    const dayDiff = (day - cDay) * 24 * 60 * 60 * 1000;
    const hourDiff = (hour - cHour) * 60 * 60 * 1000;
    const minuteDiff = (minute - cMinute) * 60 * 1000;
    const totalDiff = yearDiff + monthDiff + dayDiff + hourDiff + minuteDiff;

    candidate = new Date(candidate.getTime() + totalDiff);
  }

  return candidate;
}

/**
 * Gets current date-time in the specified timezone, returns as UTC Date
 */
function getNowInTimezone(currentTime: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(currentTime);
  const year = parseInt(parts.find((p) => p.type === "year")?.value || "0");
  const month = parseInt(parts.find((p) => p.type === "month")?.value || "0");
  const day = parseInt(parts.find((p) => p.type === "day")?.value || "0");
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");

  return parseLocalDateTimeInTimezone(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    timezone
  );
}

/**
 * Gets the day of week (1=Monday, 7=Sunday) for a date in the specified timezone
 */
function getDayOfWeek(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  });

  const dayLong = formatter.format(date);
  const dayMap: Record<string, number> = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };

  return dayMap[dayLong] || 1;
}

/**
 * Gets day of month for a date in the specified timezone
 */
function getDayOfMonth(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    day: "numeric",
  });
  return parseInt(formatter.format(date));
}

/**
 * Gets month (1-12) for a date in the specified timezone
 */
function getMonth(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "numeric",
  });
  return parseInt(formatter.format(date));
}

/**
 * Gets year for a date in the specified timezone
 */
function getYear(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
  });
  return parseInt(formatter.format(date));
}

/**
 * Adds days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Gets date string (YYYY-MM-DD) for a date in the specified timezone
 */
function getDateString(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || "0";
  const month = parts.find((p) => p.type === "month")?.value || "0";
  const day = parts.find((p) => p.type === "day")?.value || "0";

  return `${year}-${month}-${day}`;
}

/**
 * Calculates the next run time for a schedule
 * @param currentServerTime Current server time (UTC)
 * @param schedule Schedule instance
 * @param taskTimezone IANA timezone identifier for the task
 * @returns Next run time as Date (UTC) or null if schedule has expired or is inactive
 */
export function getNextRunAt(
  currentServerTime: Date,
  schedule: Schedule,
  taskTimezone: string
): Date | null {
  // Check if schedule is active
  if (schedule.status !== StatusKind.active) {
    return null;
  }

  // Get current time in task timezone
  const nowInTz = getNowInTimezone(currentServerTime, taskTimezone);

  if (schedule.kind === ScheduleKind.one_time) {
    // Handle one-time schedules
    if (schedule.runAtDates.length === 0 || schedule.runAtTimes.length === 0) {
      return null;
    }

    // Find the first future occurrence
    let nextRun: Date | null = null;

    for (
      let i = 0;
      i < schedule.runAtDates.length && i < schedule.runAtTimes.length;
      i++
    ) {
      const runDate = parseLocalDateTimeInTimezone(
        schedule.runAtDates[i],
        schedule.runAtTimes[i],
        taskTimezone
      );

      if (runDate > nowInTz) {
        if (!nextRun || runDate < nextRun) {
          nextRun = runDate;
        }
      }
    }

    return nextRun;
  }

  // Handle recurring schedules
  if (schedule.kind === ScheduleKind.recurring) {
    if (!schedule.timesOfDay || schedule.timesOfDay.length === 0) {
      return null;
    }

    // Check endAtDate
    if (schedule.endAtDate) {
      const endDate = parseLocalDateTimeInTimezone(
        schedule.endAtDate,
        "23:59",
        taskTimezone
      );
      if (nowInTz > endDate) {
        return null;
      }
    }

    // Check startAtDate
    let startDate: Date | null = null;
    if (schedule.startAtDate) {
      startDate = parseLocalDateTimeInTimezone(
        schedule.startAtDate,
        "00:00",
        taskTimezone
      );
      if (nowInTz < startDate) {
        // Schedule hasn't started yet, return first occurrence
        const firstTime = schedule.timesOfDay[0];
        const firstRun = parseLocalDateTimeInTimezone(
          schedule.startAtDate,
          firstTime,
          taskTimezone
        );
        return firstRun > currentServerTime ? firstRun : null;
      }
    }

    const frequency = schedule.frequency || ScheduleFrequency.daily;
    const intervalStep = schedule.intervalStep || 1;

    // Helper function to check if a date matches all filters
    const dateMatchesFilters = (date: Date): boolean => {
      const dateStr = getDateString(date, taskTimezone);

      // Check daysOfWeek
      if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        const dayOfWeek = getDayOfWeek(date, taskTimezone);
        if (!schedule.daysOfWeek.includes(dayOfWeek)) {
          return false;
        }
      }

      // Check daysOfMonth
      if (schedule.daysOfMonth && schedule.daysOfMonth.length > 0) {
        const dayOfMonth = getDayOfMonth(date, taskTimezone);
        if (!schedule.daysOfMonth.includes(dayOfMonth)) {
          return false;
        }
      }

      // Check monthsOfYear
      if (schedule.monthsOfYear && schedule.monthsOfYear.length > 0) {
        const month = getMonth(date, taskTimezone);
        if (!schedule.monthsOfYear.includes(month)) {
          return false;
        }
      }

      // Check startAtDate
      if (startDate) {
        const startDateStr = getDateString(startDate, taskTimezone);
        if (dateStr < startDateStr) {
          return false;
        }
      }

      // Check intervalStep based on frequency
      if (startDate) {
        const startDateStr = getDateString(startDate, taskTimezone);

        if (frequency === ScheduleFrequency.daily) {
          // Calculate days since start date (at midnight in timezone)
          const startDateMidnight = parseLocalDateTimeInTimezone(
            startDateStr,
            "00:00",
            taskTimezone
          );
          const candidateDateMidnight = parseLocalDateTimeInTimezone(
            dateStr,
            "00:00",
            taskTimezone
          );
          const daysSinceStart = Math.floor(
            (candidateDateMidnight.getTime() - startDateMidnight.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          if (daysSinceStart < 0 || daysSinceStart % intervalStep !== 0) {
            return false;
          }
        } else if (frequency === ScheduleFrequency.weekly) {
          const startDateMidnight = parseLocalDateTimeInTimezone(
            startDateStr,
            "00:00",
            taskTimezone
          );
          const candidateDateMidnight = parseLocalDateTimeInTimezone(
            dateStr,
            "00:00",
            taskTimezone
          );
          const daysSinceStart = Math.floor(
            (candidateDateMidnight.getTime() - startDateMidnight.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          const weeksSinceStart = Math.floor(daysSinceStart / 7);
          if (weeksSinceStart < 0 || weeksSinceStart % intervalStep !== 0) {
            return false;
          }
        } else if (frequency === ScheduleFrequency.monthly) {
          const startYear = getYear(startDate, taskTimezone);
          const startMonth = getMonth(startDate, taskTimezone);
          const candidateYear = getYear(date, taskTimezone);
          const candidateMonth = getMonth(date, taskTimezone);
          const monthsSinceStart =
            (candidateYear - startYear) * 12 + (candidateMonth - startMonth);
          if (monthsSinceStart < 0 || monthsSinceStart % intervalStep !== 0) {
            return false;
          }
        } else if (frequency === ScheduleFrequency.yearly) {
          const startYear = getYear(startDate, taskTimezone);
          const candidateYear = getYear(date, taskTimezone);
          const yearsSinceStart = candidateYear - startYear;
          if (yearsSinceStart < 0 || yearsSinceStart % intervalStep !== 0) {
            return false;
          }
        }
      }

      return true;
    };

    // Calculate next occurrence based on frequency
    let candidateDate = new Date(nowInTz);
    const maxIterations = 1000; // Safety limit
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      // Check if this date matches filters
      if (!dateMatchesFilters(candidateDate)) {
        candidateDate = addDays(candidateDate, 1);
        continue;
      }

      // Check endAtDate first - if we're past the last time on end date, return null
      if (schedule.endAtDate) {
        const endDateStr = schedule.endAtDate;
        const candidateDateStr = getDateString(candidateDate, taskTimezone);

        // If we're past the end date, return null
        if (candidateDateStr > endDateStr) {
          return null;
        }

        // If we're on the end date, check if current time is past the last time
        if (candidateDateStr === endDateStr) {
          const sortedTimes = [...schedule.timesOfDay].sort();
          const lastTime = sortedTimes[sortedTimes.length - 1];
          const lastDateTime = parseLocalDateTimeInTimezone(
            endDateStr,
            lastTime,
            taskTimezone
          );
          // If current time is past the last time on end date, return null
          if (nowInTz.getTime() > lastDateTime.getTime()) {
            return null;
          }
        }
      }

      // Check all times of day for this candidate date
      // Sort times to check them in order
      const sortedTimes = [...schedule.timesOfDay].sort();

      for (const timeOfDay of sortedTimes) {
        const dateStr = getDateString(candidateDate, taskTimezone);
        const candidateDateTime = parseLocalDateTimeInTimezone(
          dateStr,
          timeOfDay,
          taskTimezone
        );

        // Compare with current time (both are UTC dates representing local times in task timezone)
        if (candidateDateTime.getTime() > nowInTz.getTime()) {
          return candidateDateTime;
        }
      }

      // All times for this day have passed, move to next day
      candidateDate = addDays(candidateDate, 1);

      // Safety check: if we've gone too far, break
      if (schedule.endAtDate) {
        const endDateStr = schedule.endAtDate;
        const endDate = parseLocalDateTimeInTimezone(
          endDateStr,
          "00:00",
          taskTimezone
        );
        const candidateDateStr = getDateString(candidateDate, taskTimezone);
        const endDateStrOnly = getDateString(endDate, taskTimezone);
        if (candidateDateStr > endDateStrOnly) {
          return null;
        }
      }
    }

    return null;
  }

  return null;
}
