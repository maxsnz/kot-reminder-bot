import { ReminderDeliveryService } from "./reminderDelivery.service";
import {
  Schedule,
  ScheduleKind,
  ScheduleFrequency,
  StatusKind,
} from "@/prisma/generated/client";

// Fixed instant: 2026-07-18T04:00:00Z. In UTC+8 ("Etc/GMT-8") that is 12:00
// local — so a reminder anchored to 11:00 local is already 1 hour in the past.
const NOW_ISO = "2026-07-18T04:00:00Z";
const TZ = "Etc/GMT-8"; // UTC+8, no DST

function makeDailySchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: "sched-1",
    userId: "user-1",
    message: "выпить таблетки",
    emoji: "💊",
    kind: ScheduleKind.recurring,
    frequency: ScheduleFrequency.daily,
    intervalStep: 1,
    timesOfDay: ["11:00"],
    daysOfWeek: [],
    daysOfMonth: [],
    monthsOfYear: [],
    startAtDate: null,
    endAtDate: null,
    runAtDates: [],
    runAtTimes: [],
    status: StatusKind.active,
    // created at 2026-07-18 00:00 local (+8) => 2026-07-17T16:00Z
    createdAt: new Date("2026-07-17T16:00:00Z"),
    ...overrides,
  } as Schedule;
}

function buildService(opts: {
  schedules: Schedule[];
  lastDeliveredAt: Date | null;
}) {
  const chatMessageService = {
    getLastReminderDeliveryAt: jest
      .fn()
      .mockResolvedValue(opts.lastDeliveredAt),
  };
  const scheduleService = {
    findActiveByUserId: jest.fn().mockResolvedValue(opts.schedules),
  };
  const userService = {
    findById: jest.fn().mockResolvedValue({
      id: "user-1",
      chatId: 123,
      username: "tester",
      timezone: TZ,
    }),
  };
  const service = new ReminderDeliveryService(
    {} as any,
    chatMessageService as any,
    {} as any,
    userService as any,
    scheduleService as any
  );
  const deliverSpy = jest
    .spyOn(service, "deliver")
    .mockResolvedValue(undefined);
  return { service, deliverSpy };
}

describe("ReminderDeliveryService.fireMissedForUser", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW_ISO));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("delivers a recurring reminder whose today time is now in the past", async () => {
    const { service, deliverSpy } = buildService({
      schedules: [makeDailySchedule()],
      lastDeliveredAt: null,
    });

    await service.fireMissedForUser("user-1", TZ);

    expect(deliverSpy).toHaveBeenCalledTimes(1);
  });

  it("does not re-deliver if it was already delivered today", async () => {
    const { service, deliverSpy } = buildService({
      schedules: [makeDailySchedule()],
      // delivered today at 11:30 local (+8) => 2026-07-18T03:30Z
      lastDeliveredAt: new Date("2026-07-18T03:30:00Z"),
    });

    await service.fireMissedForUser("user-1", TZ);

    expect(deliverSpy).not.toHaveBeenCalled();
  });

  it("does not deliver a reminder whose time is still in the future", async () => {
    const { service, deliverSpy } = buildService({
      // 18:00 local is still ahead of 12:00 "now"
      schedules: [makeDailySchedule({ timesOfDay: ["18:00"] })],
      lastDeliveredAt: null,
    });

    await service.fireMissedForUser("user-1", TZ);

    expect(deliverSpy).not.toHaveBeenCalled();
  });

  it("delivers a one-time reminder that fell into the past after re-anchoring", async () => {
    const oneTime = makeDailySchedule({
      kind: ScheduleKind.one_time,
      frequency: null,
      timesOfDay: [],
      runAtDates: ["2026-07-18"],
      runAtTimes: ["11:00"],
    });
    const { service, deliverSpy } = buildService({
      schedules: [oneTime],
      lastDeliveredAt: null,
    });

    await service.fireMissedForUser("user-1", TZ);

    expect(deliverSpy).toHaveBeenCalledTimes(1);
  });
});
