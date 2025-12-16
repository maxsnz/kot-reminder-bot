import {
  Schedule,
  ScheduleKind,
  ScheduleFrequency,
} from "@/prisma/generated/client";

/**
 * Formats a schedule for display in the reminders list
 *
 * Example output:
 * 💊 принимать таблетки
 * 📅 каждый день 🕒 10:00
 *
 * 🐑 выгулять баранов
 * 📅 15 дек 2025 🕒 15:00
 *
 * 🐈 покормить котов
 * 📅 25 дек и 26 дек
 * 🕒 10:00 · 14:00
 */
export function formatScheduleList(
  schedule: Schedule,
  timezone: string
): string {
  const emoji = schedule.emoji || "🔘";
  const action = schedule.actionSummary || schedule.message;

  if (!timezone) {
    // Fallback if timezone is missing
    return `${emoji} ${action}`;
  }

  // Get times from appropriate array
  let times: string[] = [];
  if (schedule.kind === ScheduleKind.one_time) {
    times = schedule.runAtTimes || [];
  } else {
    times = schedule.timesOfDay || [];
  }

  // Format times
  const timeLine = times.length > 0 ? `🕒 ${times.join(" · ")}` : "";

  // Build date/frequency part
  let datePart = "";
  let hasDateRange = false;

  if (schedule.kind === ScheduleKind.one_time) {
    // Format dates from runAtDates
    if (schedule.runAtDates && schedule.runAtDates.length > 0) {
      if (schedule.runAtDates.length === 1) {
        // Single date - format on same line as times
        datePart = formatDateShort(schedule.runAtDates[0], timezone);
        hasDateRange = false;
      } else {
        // Multiple dates - format as range on separate line
        datePart = formatDateRange(schedule.runAtDates, timezone);
        hasDateRange = true;
      }
    }
  } else {
    // Format frequency for recurring schedules
    const frequencyStr = formatRecurringFrequency(schedule, timezone);
    datePart = frequencyStr.frequency;
    hasDateRange = frequencyStr.hasRange;
  }

  // Build output based on layout rules
  if (!datePart && !timeLine) {
    return `${emoji} ${action}`;
  }

  if (!datePart) {
    // Only times, no date/frequency
    return `${emoji} ${action}\n${timeLine}`;
  }

  if (!timeLine) {
    // Only date/frequency, no times
    return `${emoji} ${action}\n📅 ${datePart}`;
  }

  // Both date/frequency and times exist
  if (hasDateRange) {
    // Date range on separate line, times on next line
    return `${emoji} ${action}\n📅 ${datePart}\n${timeLine}`;
  } else {
    // Single date or simple frequency - all on one line
    return `${emoji} ${action}\n📅 ${datePart} ${timeLine}`;
  }
}

/**
 * Formats a single date in short Russian format
 * @param dateStr Date in YYYY-MM-DD format
 * @param timezone IANA timezone identifier
 * @returns Formatted date string (e.g., "15 дек" or "15 дек 2025")
 */
function formatDateShort(dateStr: string, timezone: string): string {
  try {
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    const [year, month, day] = dateStr.split("-").map(Number);

    // Validate month and day ranges
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      isNaN(year) ||
      isNaN(month) ||
      isNaN(day)
    ) {
      return dateStr;
    }

    const currentYear = getCurrentYear(timezone);

    const monthNames = [
      "янв",
      "фев",
      "мар",
      "апр",
      "май",
      "июн",
      "июл",
      "авг",
      "сен",
      "окт",
      "ноя",
      "дек",
    ];

    const monthName = monthNames[month - 1];

    if (!monthName) {
      return dateStr;
    }

    if (year === currentYear) {
      return `${day} ${monthName}`;
    } else {
      return `${day} ${monthName} ${year}`;
    }
  } catch (error) {
    // Fallback to original string if parsing fails
    return dateStr;
  }
}

/**
 * Formats multiple dates as a range
 * @param dates Array of dates in YYYY-MM-DD format
 * @param timezone IANA timezone identifier
 * @returns Formatted date range string (e.g., "15 дек и 16 дек")
 */
function formatDateRange(dates: string[], timezone: string): string {
  if (!dates || dates.length === 0) {
    return "";
  }
  const formattedDates = dates
    .filter((date) => date) // Filter out empty/null dates
    .map((date) => formatDateShort(date, timezone));
  return formattedDates.join(" и ");
}

/**
 * Formats recurring frequency string based on schedule fields
 * @param schedule Schedule object
 * @param timezone IANA timezone identifier
 * @returns Object with frequency string and hasRange flag
 */
function formatRecurringFrequency(
  schedule: Schedule,
  timezone: string
): { frequency: string; hasRange: boolean } {
  const frequency = schedule.frequency || ScheduleFrequency.daily;
  const intervalStep = schedule.intervalStep || 1;
  const daysOfWeek = schedule.daysOfWeek || [];
  const daysOfMonth = schedule.daysOfMonth || [];
  const monthsOfYear = schedule.monthsOfYear || [];
  const startAtDate = schedule.startAtDate;
  const endAtDate = schedule.endAtDate;

  let frequencyStr = "";
  let hasRange = false;

  // Check if there's a date range
  if (endAtDate) {
    hasRange = true;
  }

  // Build frequency string based on specific day/month filters
  if (daysOfWeek.length > 0) {
    // Specific days of week
    const dayNames = [
      "воскресенье",
      "понедельник",
      "вторник",
      "среда",
      "четверг",
      "пятница",
      "суббота",
    ];
    const dayNamesList = daysOfWeek
      .sort((a, b) => a - b)
      .map((day) => dayNames[day])
      .join(" и ");

    if (intervalStep === 1) {
      frequencyStr = `каждый ${dayNamesList}`;
    } else {
      frequencyStr = `каждые ${intervalStep} недели (${dayNamesList})`;
    }
  } else if (daysOfMonth.length > 0) {
    // Specific days of month
    const daysList = daysOfMonth
      .sort((a, b) => a - b)
      .map((day) => `${day}-й`)
      .join(", ");

    if (intervalStep === 1) {
      frequencyStr = `каждый ${daysList} день месяца`;
    } else {
      frequencyStr = `каждые ${intervalStep} месяца (${daysList} число)`;
    }
  } else if (monthsOfYear.length > 0) {
    // Specific months
    const monthNames = [
      "январь",
      "февраль",
      "март",
      "апрель",
      "май",
      "июнь",
      "июль",
      "август",
      "сентябрь",
      "октябрь",
      "ноябрь",
      "декабрь",
    ];
    const monthsList = monthsOfYear
      .sort((a, b) => a - b)
      .map((month) => monthNames[month - 1])
      .join(", ");

    if (intervalStep === 1) {
      frequencyStr = `каждый ${monthsList}`;
    } else {
      frequencyStr = `каждый год (${monthsList})`;
    }
  } else {
    // Generic frequency based on frequency field
    switch (frequency) {
      case ScheduleFrequency.daily:
        if (intervalStep === 1) {
          frequencyStr = "каждый день";
        } else {
          frequencyStr = `каждые ${intervalStep} дня`;
        }
        break;
      case ScheduleFrequency.weekly:
        if (intervalStep === 1) {
          frequencyStr = "каждую неделю";
        } else {
          frequencyStr = `каждые ${intervalStep} недели`;
        }
        break;
      case ScheduleFrequency.monthly:
        if (intervalStep === 1) {
          frequencyStr = "каждый месяц";
        } else {
          frequencyStr = `каждые ${intervalStep} месяца`;
        }
        break;
      case ScheduleFrequency.yearly:
        if (intervalStep === 1) {
          frequencyStr = "каждый год";
        } else {
          frequencyStr = `каждые ${intervalStep} года`;
        }
        break;
      default:
        frequencyStr = "каждый день";
    }
  }

  // Add date range if applicable
  if (startAtDate && endAtDate) {
    const startFormatted = formatDateShort(startAtDate, timezone);
    const endFormatted = formatDateShort(endAtDate, timezone);
    frequencyStr = `${frequencyStr} с ${startFormatted} по ${endFormatted}`;
    hasRange = true;
  } else if (startAtDate) {
    const startFormatted = formatDateShort(startAtDate, timezone);
    frequencyStr = `${frequencyStr} с ${startFormatted}`;
    hasRange = true;
  } else if (endAtDate) {
    const endFormatted = formatDateShort(endAtDate, timezone);
    frequencyStr = `${frequencyStr} до ${endFormatted}`;
    hasRange = true;
  }

  return { frequency: frequencyStr, hasRange };
}

/**
 * Gets current year in the specified timezone
 * @param timezone IANA timezone identifier
 * @returns Current year number
 */
function getCurrentYear(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value;
    return year ? parseInt(year, 10) : new Date().getFullYear();
  } catch (error) {
    // Fallback to UTC year
    return new Date().getFullYear();
  }
}
