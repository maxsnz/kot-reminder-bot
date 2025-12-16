import { getNextRunAt } from "@/utils/getNextRunAt";
import {
  Schedule,
  ScheduleKind,
  ScheduleFrequency,
  StatusKind,
} from "@/prisma/generated/client";

describe("getNextRunAt", () => {
  const createSchedule = (overrides: Partial<Schedule>): Schedule => {
    return {
      id: "test-id",
      userId: "test-user-id",
      message: "Test message",
      kind: ScheduleKind.one_time,
      sourceText: "test",
      summary: "test",
      timeSummary: "test",
      actionSummary: "test",
      status: StatusKind.active,
      runAtDates: [],
      runAtTimes: [],
      frequency: null,
      intervalStep: 1,
      startAtDate: null,
      endAtDate: null,
      timesOfDay: [],
      daysOfWeek: [],
      daysOfMonth: [],
      monthsOfYear: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as Schedule;
  };

  describe("Status checks", () => {
    it("should return null for canceled schedule", () => {
      const schedule = createSchedule({
        status: StatusKind.canceled,
        kind: ScheduleKind.one_time,
        runAtDates: ["2025-12-20"],
        runAtTimes: ["10:00"],
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).toBeNull();
    });

    it("should return null for ended schedule", () => {
      const schedule = createSchedule({
        status: StatusKind.ended,
        kind: ScheduleKind.one_time,
        runAtDates: ["2025-12-20"],
        runAtTimes: ["10:00"],
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).toBeNull();
    });

    it("should process active schedule", () => {
      const schedule = createSchedule({
        status: StatusKind.active,
        kind: ScheduleKind.one_time,
        runAtDates: ["2025-12-20"],
        runAtTimes: ["10:00"],
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
    });
  });

  describe("One-time schedules", () => {
    it("should return future occurrence for single date-time", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.one_time,
        runAtDates: ["2025-12-20"],
        runAtTimes: ["10:00"],
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-20T10:00:00");
    });

    it("should return null for past occurrence", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.one_time,
        runAtDates: ["2025-12-10"],
        runAtTimes: ["10:00"],
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).toBeNull();
    });

    it("should return first future occurrence from multiple", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.one_time,
        runAtDates: ["2025-12-10", "2025-12-20", "2025-12-25"],
        runAtTimes: ["10:00", "15:00", "20:00"],
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-20T15:00:00");
    });

    it("should return null if all occurrences are in the past", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.one_time,
        runAtDates: ["2025-12-10", "2025-12-12"],
        runAtTimes: ["10:00", "15:00"],
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).toBeNull();
    });

    it("should return null for empty runAtDates", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.one_time,
        runAtDates: [],
        runAtTimes: [],
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).toBeNull();
    });

    it("should handle timezone correctly for one-time schedule", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.one_time,
        runAtDates: ["2025-12-20"],
        runAtTimes: ["10:00"],
      });
      const currentTime = new Date("2025-12-20T05:00:00Z"); // 5 AM UTC
      const result = getNextRunAt(currentTime, schedule, "Europe/Moscow"); // 8 AM Moscow time
      expect(result).not.toBeNull();
      // Should return 10:00 Moscow time which is 7:00 UTC
      expect(result!.getUTCHours()).toBe(7);
    });
  });

  describe("Recurring schedules - Daily", () => {
    it("should return next occurrence for daily schedule", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-15T09:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-15T10:00:00");
    });

    it("should return next day if current time has passed", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-15T11:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-16T10:00:00");
    });

    it("should handle multiple timesOfDay", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["10:00", "15:00", "20:00"],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-15T12:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-15T15:00:00");
    });

    it("should return null if no timesOfDay", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: [],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).toBeNull();
    });

    it("should respect intervalStep for daily schedule", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 2, // Every 2 days
        timesOfDay: ["10:00"],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-15T11:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      // Should be 2 days from start (12-10, 12-12, 12-14, 12-16...)
      expect(result!.toISOString()).toContain("2025-12-16T10:00:00");
    });

    it("should wait for startAtDate if in the future", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        startAtDate: "2025-12-20",
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-20T10:00:00");
    });

    it("should return null if endAtDate has passed", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        startAtDate: "2025-12-10",
        endAtDate: "2025-12-12",
      });
      const currentTime = new Date("2025-12-15T10:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).toBeNull();
    });
  });

  describe("Recurring schedules - Weekly", () => {
    it("should return next occurrence for weekly schedule on specific day", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.weekly,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        daysOfWeek: [1], // Monday
        startAtDate: "2025-12-10",
      });
      // 2025-12-15 is Monday
      const currentTime = new Date("2025-12-15T09:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-15T10:00:00");
    });

    it("should return next week if current day has passed", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.weekly,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        daysOfWeek: [1], // Monday
        startAtDate: "2025-12-10",
      });
      // 2025-12-15 is Monday, but it's 11 AM
      const currentTime = new Date("2025-12-15T11:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      // Next Monday
      expect(result!.toISOString()).toContain("2025-12-22T10:00:00");
    });

    it("should handle multiple daysOfWeek", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.weekly,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
        startAtDate: "2025-12-10",
      });
      // 2025-12-15 is Monday, 9 AM
      const currentTime = new Date("2025-12-15T09:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-15T10:00:00");
    });

    it("should respect intervalStep for weekly schedule", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.weekly,
        intervalStep: 2, // Every 2 weeks
        timesOfDay: ["10:00"],
        daysOfWeek: [1], // Monday
        startAtDate: "2025-12-08", // Monday
      });
      // 2025-12-15 is Monday, 11 AM (past the time)
      const currentTime = new Date("2025-12-15T11:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      // Should be 2 weeks from start week
      expect(result!.toISOString()).toContain("2025-12-22T10:00:00");
    });
  });

  describe("Recurring schedules - Monthly", () => {
    it("should return next occurrence for monthly schedule on specific day", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.monthly,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        daysOfMonth: [15],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-15T09:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-15T10:00:00");
    });

    it("should return next month if current day has passed", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.monthly,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        daysOfMonth: [15],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-15T11:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2026-01-15T10:00:00");
    });

    it("should handle multiple daysOfMonth", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.monthly,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        daysOfMonth: [1, 15, 30],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-15T11:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-30T10:00:00");
    });
  });

  describe("Recurring schedules - Yearly", () => {
    it("should return next occurrence for yearly schedule", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.yearly,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        monthsOfYear: [12],
        daysOfMonth: [25],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-15T09:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-25T10:00:00");
    });

    it("should return next year if current date has passed", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.yearly,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        monthsOfYear: [12],
        daysOfMonth: [25],
        startAtDate: "2025-12-10",
      });
      const currentTime = new Date("2025-12-25T11:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2026-12-25T10:00:00");
    });
  });

  describe("Timezone handling", () => {
    it("should handle timezone conversion correctly", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        startAtDate: "2025-12-15",
      });
      // Current time: 2025-12-15 05:00 UTC = 10:00 Moscow time
      const currentTime = new Date("2025-12-15T05:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "Europe/Moscow");
      expect(result).not.toBeNull();
      // Should return 10:00 Moscow time = 07:00 UTC
      expect(result!.getUTCHours()).toBe(7);
    });

    it("should handle different timezones for one-time schedule", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.one_time,
        runAtDates: ["2025-12-20"],
        runAtTimes: ["10:00"],
      });
      const currentTime = new Date("2025-12-20T06:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "America/New_York");
      expect(result).not.toBeNull();
      // 10:00 EST = 15:00 UTC (or 14:00 EDT)
      const hour = result!.getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(14);
      expect(hour).toBeLessThanOrEqual(15);
    });

    it("should handle timezone conversion between Europe/Moscow and Asia/Makassar", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["15:00"], // 3 PM in Asia/Makassar
        startAtDate: "2025-12-15",
      });

      // Server time: 2025-12-15 10:00 in Europe/Moscow = 2025-12-15 07:00 UTC
      // In Asia/Makassar (UTC+8): 07:00 UTC = 15:00 local time
      // Since schedule runs at 15:00 Makassar and we're at 15:00, next run should be next day
      const currentTime = new Date("2025-12-15T07:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "Asia/Makassar");

      expect(result).not.toBeNull();
      // Should return next day 15:00 Asia/Makassar = 2025-12-16 07:00 UTC
      expect(result!.toISOString()).toContain("2025-12-16T07:00:00");
    });
  });

  describe("Edge cases", () => {
    it("should handle schedule with no endAtDate (infinite)", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        startAtDate: "2025-12-10",
        endAtDate: null,
      });
      const currentTime = new Date("2025-12-15T11:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-16T10:00:00");
    });

    it("should handle schedule exactly at endAtDate", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        startAtDate: "2025-12-10",
        endAtDate: "2025-12-15",
      });
      const currentTime = new Date("2025-12-15T09:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toContain("2025-12-15T10:00:00");
    });

    it("should return null if current time is after endAtDate time", () => {
      const schedule = createSchedule({
        kind: ScheduleKind.recurring,
        frequency: ScheduleFrequency.daily,
        intervalStep: 1,
        timesOfDay: ["10:00"],
        startAtDate: "2025-12-10",
        endAtDate: "2025-12-15",
      });
      const currentTime = new Date("2025-12-15T11:00:00Z");
      const result = getNextRunAt(currentTime, schedule, "UTC");
      expect(result).toBeNull();
    });
  });
});
