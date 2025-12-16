import {
  PrismaClient,
  Schedule,
  ScheduleKind,
  ScheduleFrequency,
  StatusKind,
  User,
} from "@/prisma/generated/client";
import { z } from "zod";
import { ResultCreateSchedule, ResultUpdateSchedule } from "@/bot/prompt";
import { GraphileWorkerService } from "./graphileWorker.service";
import { getNextRunAt } from "@/utils/getNextRunAt";
import { logger } from "@/utils/logger";

export class ScheduleService {
  constructor(
    private prisma: PrismaClient,
    private graphileWorkerService: GraphileWorkerService
  ) {}

  // Create a one-time schedule
  async createOneTimeSchedule(params: {
    userId: string;
    message: string;
    sourceText: string;
    summary: string;
    timeSummary: string;
    actionSummary: string;
    emoji?: string | null;
    runAtDates: string[];
    runAtTimes: string[];
    timezone: string;
  }): Promise<Schedule> {
    const schedule = await this.prisma.schedule.create({
      data: {
        userId: params.userId,
        message: params.message,
        sourceText: params.sourceText,
        summary: params.summary,
        timeSummary: params.timeSummary,
        actionSummary: params.actionSummary,
        emoji: params.emoji ?? null,
        kind: ScheduleKind.one_time,
        runAtDates: params.runAtDates,
        runAtTimes: params.runAtTimes,
        status: StatusKind.active,
      },
    });

    await this.syncJobsForSchedule(schedule.id, params.timezone);
    return schedule;
  }

  // Create a recurring schedule
  async createRecurringSchedule(params: {
    userId: string;
    message: string;
    sourceText: string;
    summary: string;
    timeSummary: string;
    actionSummary: string;
    emoji?: string | null;
    frequency: ScheduleFrequency;
    intervalStep?: number;
    startAtDate?: string | null;
    endAtDate?: string | null;
    timesOfDay?: string[];
    daysOfWeek?: number[];
    daysOfMonth?: number[];
    monthsOfYear?: number[];
    timezone: string;
  }): Promise<Schedule> {
    const schedule = await this.prisma.schedule.create({
      data: {
        userId: params.userId,
        message: params.message,
        sourceText: params.sourceText,
        summary: params.summary,
        timeSummary: params.timeSummary,
        actionSummary: params.actionSummary,
        emoji: params.emoji ?? null,
        kind: ScheduleKind.recurring,
        frequency: params.frequency,
        intervalStep: params.intervalStep ?? 1,
        startAtDate: params.startAtDate ?? null,
        endAtDate: params.endAtDate ?? null,
        timesOfDay: params.timesOfDay ?? [],
        daysOfWeek: params.daysOfWeek ?? [],
        daysOfMonth: params.daysOfMonth ?? [],
        monthsOfYear: params.monthsOfYear ?? [],
        status: StatusKind.active,
      },
    });

    await this.syncJobsForSchedule(schedule.id, params.timezone);
    return schedule;
  }

  // Find schedule by ID
  async findById(
    id: string
  ): Promise<(Schedule & { user: User | null }) | null> {
    return this.prisma.schedule.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
  }

  // Get all schedules for a user
  async findByUserId(userId: string): Promise<Schedule[]> {
    return this.prisma.schedule.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  // Get active schedules for a user
  async findActiveByUserId(userId: string): Promise<Schedule[]> {
    return this.prisma.schedule.findMany({
      where: {
        userId,
        status: StatusKind.active,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Get schedules by status
  async findByStatus(status: StatusKind): Promise<Schedule[]> {
    return this.prisma.schedule.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
    });
  }

  // Get all active schedules
  async findAllActive(): Promise<Schedule[]> {
    return this.prisma.schedule.findMany({
      where: { status: StatusKind.active },
      include: {
        user: true,
      },
    });
  }

  // Update schedule
  async updateSchedule(
    id: string,
    data: Partial<Schedule>,
    timezone?: string
  ): Promise<Schedule> {
    const schedule = await this.prisma.schedule.update({
      where: { id },
      data,
    });

    // Get timezone from schedule if not provided
    const scheduleTimezone =
      timezone ?? (await this.getTimezoneFromSchedule(id));
    if (scheduleTimezone) {
      await this.syncJobsForSchedule(id, scheduleTimezone);
    }
    return schedule;
  }

  // Cancel a schedule
  async cancelSchedule(id: string): Promise<Schedule> {
    const schedule = await this.prisma.schedule.update({
      where: { id },
      data: { status: StatusKind.canceled },
    });

    // Delete worker jobs for this schedule
    const jobKeyPattern = `schedule:${id}`;
    try {
      await this.graphileWorkerService.deleteJobsByKeyPattern(jobKeyPattern);
      logger.info(
        { scheduleId: id },
        "Deleted worker jobs for canceled schedule"
      );
    } catch (error) {
      logger.error(
        { err: error, scheduleId: id },
        "Failed to delete worker jobs for canceled schedule"
      );
      // Continue even if job deletion fails
    }

    return schedule;
  }

  // End a schedule
  async endSchedule(id: string): Promise<Schedule> {
    const schedule = await this.prisma.schedule.update({
      where: { id },
      data: { status: StatusKind.ended },
    });

    // Delete worker jobs for this schedule
    const jobKeyPattern = `schedule:${id}`;
    try {
      await this.graphileWorkerService.deleteJobsByKeyPattern(jobKeyPattern);
      logger.info({ scheduleId: id }, "Deleted worker jobs for ended schedule");
    } catch (error) {
      logger.error(
        { err: error, scheduleId: id },
        "Failed to delete worker jobs for ended schedule"
      );
      // Continue even if job deletion fails
    }

    return schedule;
  }

  // Activate a schedule
  async activateSchedule(id: string): Promise<Schedule> {
    return this.prisma.schedule.update({
      where: { id },
      data: { status: StatusKind.active },
    });
  }

  // Delete schedule
  async deleteSchedule(id: string): Promise<void> {
    // Delete worker jobs for this schedule
    const jobKeyPattern = `schedule:${id}`;
    try {
      await this.graphileWorkerService.deleteJobsByKeyPattern(jobKeyPattern);
      logger.info(
        { scheduleId: id },
        "Deleted worker jobs for deleted schedule"
      );
    } catch (error) {
      logger.error(
        { err: error, scheduleId: id },
        "Failed to delete worker jobs for deleted schedule"
      );
      // Continue even if job deletion fails
    }

    await this.prisma.schedule.delete({
      where: { id },
    });
  }

  // Create schedule from AI response data
  async createScheduleFromAIResponse(
    userId: string,
    scheduleData: NonNullable<z.infer<typeof ResultCreateSchedule>["schedule"]>,
    sourceText: string,
    timezone: string
  ): Promise<Schedule> {
    if (scheduleData.kind === "one_time") {
      return this.createOneTimeSchedule({
        userId,
        message: scheduleData.message,
        sourceText,
        summary: scheduleData.summary,
        timeSummary: scheduleData.timeSummary,
        actionSummary: scheduleData.actionSummary,
        emoji: scheduleData.emoji,
        runAtDates: scheduleData.runAtDates,
        runAtTimes: scheduleData.runAtTimes,
        timezone,
      });
    } else {
      return this.createRecurringSchedule({
        userId,
        message: scheduleData.message,
        sourceText,
        summary: scheduleData.summary,
        timeSummary: scheduleData.timeSummary,
        actionSummary: scheduleData.actionSummary,
        emoji: scheduleData.emoji,
        frequency: scheduleData.frequency!,
        intervalStep: scheduleData.intervalStep,
        startAtDate: scheduleData.startAtDate ?? null,
        endAtDate: scheduleData.endAtDate ?? null,
        timesOfDay: scheduleData.timesOfDay,
        daysOfWeek: scheduleData.daysOfWeek,
        daysOfMonth: scheduleData.daysOfMonth,
        monthsOfYear: scheduleData.monthsOfYear,
        timezone,
      });
    }
  }

  // Update schedule from AI response data
  async updateScheduleFromAIResponse(
    scheduleId: string,
    scheduleData: NonNullable<z.infer<typeof ResultUpdateSchedule>["patch"]>,
    timezone?: string
  ): Promise<Schedule> {
    const updateData: Parameters<typeof this.updateSchedule>[1] = {
      summary: scheduleData.summary,
      timeSummary: scheduleData.timeSummary,
      actionSummary: scheduleData.actionSummary,
    };

    if (scheduleData.message) updateData.message = scheduleData.message;
    if (scheduleData.frequency !== undefined && scheduleData.frequency !== null)
      updateData.frequency = scheduleData.frequency;

    if (scheduleData.runAtTimes)
      updateData.runAtTimes = scheduleData.runAtTimes;
    if (scheduleData.frequency) updateData.frequency = scheduleData.frequency;
    if (
      scheduleData.intervalStep !== undefined &&
      scheduleData.intervalStep !== null
    )
      updateData.intervalStep = scheduleData.intervalStep;
    if (scheduleData.startAtDate !== undefined)
      updateData.startAtDate = scheduleData.startAtDate;
    if (scheduleData.endAtDate !== undefined)
      updateData.endAtDate = scheduleData.endAtDate;
    if (scheduleData.timesOfDay)
      updateData.timesOfDay = scheduleData.timesOfDay;
    if (scheduleData.daysOfWeek)
      updateData.daysOfWeek = scheduleData.daysOfWeek;
    if (scheduleData.daysOfMonth)
      updateData.daysOfMonth = scheduleData.daysOfMonth;
    if (scheduleData.monthsOfYear)
      updateData.monthsOfYear = scheduleData.monthsOfYear;
    if (scheduleData.emoji !== undefined) updateData.emoji = scheduleData.emoji;

    return this.updateSchedule(scheduleId, updateData, timezone);
  }

  // Sync jobs for a schedule
  async syncJobsForSchedule(
    scheduleId: string,
    timezone: string
  ): Promise<void> {
    // Get schedule with user
    const schedule = await this.findById(scheduleId);
    if (!schedule) {
      logger.error({ scheduleId }, "Schedule not found");
      return;
    }

    // If schedule is not active, delete any existing jobs and return
    if (schedule.status !== StatusKind.active) {
      const jobKeyPattern = `schedule:${scheduleId}`;
      try {
        await this.graphileWorkerService.deleteJobsByKeyPattern(jobKeyPattern);
        logger.info(
          { scheduleId, status: schedule.status },
          "Deleted worker jobs for inactive schedule"
        );
      } catch (error) {
        logger.error(
          { err: error, scheduleId, status: schedule.status },
          "Failed to delete worker jobs for inactive schedule"
        );
        // Continue even if job deletion fails
      }
      return;
    }

    if (!timezone) {
      logger.error({ userId: schedule.userId }, "User has no timezone set");
      await this.endSchedule(scheduleId);
      return;
    }

    const currentTime = new Date();
    const nextRunAt = getNextRunAt(currentTime, schedule, timezone);

    if (nextRunAt) {
      // Use jobKey with replace mode to automatically replace any existing job for this schedule
      await this.graphileWorkerService.addJob(
        "schedule-reminder",
        { scheduleId, timezone },
        {
          jobKey: `schedule:${scheduleId}`,
          jobKeyMode: "replace",
          runAt: nextRunAt,
        }
      );
      logger.info(
        { scheduleId, nextRunAt: nextRunAt.toISOString() },
        "Scheduled reminder for schedule"
      );
    } else {
      await this.endSchedule(scheduleId);
    }
  }

  // Helper method to get timezone from schedule
  private async getTimezoneFromSchedule(
    scheduleId: string
  ): Promise<string | null> {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { userId: true },
    });
    if (!schedule) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: schedule.userId },
      select: { timezone: true },
    });
    return user?.timezone ?? null;
  }

  // Delete all schedules for a user and their corresponding worker jobs
  async deleteAllSchedulesByUserId(userId: string): Promise<number> {
    // Find all schedules for the user
    const schedules = await this.findByUserId(userId);
    const scheduleCount = schedules.length;

    if (scheduleCount === 0) {
      logger.info({ userId }, "No schedules found for user");
      return 0;
    }

    // Delete worker jobs for each schedule
    for (const schedule of schedules) {
      const jobKeyPattern = `schedule:${schedule.id}`;
      try {
        await this.graphileWorkerService.deleteJobsByKeyPattern(jobKeyPattern);
      } catch (error) {
        logger.error(
          { err: error, scheduleId: schedule.id, userId },
          "Failed to delete worker jobs for schedule"
        );
        // Continue with deletion even if job deletion fails
      }
    }

    // Delete all schedules from database
    const deleteResult = await this.prisma.schedule.deleteMany({
      where: { userId },
    });

    logger.info(
      { userId, deletedCount: deleteResult.count },
      "Deleted all schedules for user"
    );

    return deleteResult.count;
  }
}
