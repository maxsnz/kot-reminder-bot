import { PrismaClient, ScheduleSnooze } from "@/prisma/generated/client";
import { GraphileWorkerService } from "./graphileWorker.service";
import { logger } from "@/utils/logger";

export class ScheduleSnoozeService {
  constructor(
    private prisma: PrismaClient,
    private graphileWorkerService: GraphileWorkerService
  ) {}

  /**
   * Create a snooze for a schedule
   * Cancels any existing snoozes for the same schedule before creating a new one
   */
  async createSnooze(params: {
    scheduleId: string;
    userId: string;
    message: string;
    runAt: Date;
  }): Promise<ScheduleSnooze> {
    // Cancel any existing snoozes for this schedule
    await this.cancelSnoozesByScheduleId(params.scheduleId);

    const snooze = await this.prisma.scheduleSnooze.create({
      data: {
        scheduleId: params.scheduleId,
        userId: params.userId,
        message: params.message,
        runAt: params.runAt,
      },
    });

    // Schedule worker job for snooze execution
    await this.graphileWorkerService.addJob(
      "schedule-snooze",
      { snoozeId: snooze.id },
      {
        jobKey: `snooze:${snooze.id}`,
        jobKeyMode: "replace",
        runAt: params.runAt,
      }
    );

    logger.info(
      {
        snoozeId: snooze.id,
        scheduleId: params.scheduleId,
        runAt: params.runAt.toISOString(),
      },
      "Created snooze and scheduled worker job"
    );

    return snooze;
  }

  /**
   * Find snooze by ID
   */
  async findById(id: string): Promise<ScheduleSnooze | null> {
    return this.prisma.scheduleSnooze.findUnique({
      where: { id },
    });
  }

  /**
   * Find snooze by ID with schedule and user relations
   */
  async findByIdWithRelations(
    id: string
  ): Promise<
    | (ScheduleSnooze & {
        schedule: { id: string; message: string; emoji: string | null } | null;
        user: { id: string; chatId: number; timezone: string | null } | null;
      })
    | null
  > {
    return this.prisma.scheduleSnooze.findUnique({
      where: { id },
      include: {
        schedule: {
          select: {
            id: true,
            message: true,
            emoji: true,
          },
        },
        user: {
          select: {
            id: true,
            chatId: true,
            timezone: true,
          },
        },
      },
    });
  }

  /**
   * Find active snoozes for a schedule
   */
  async findByScheduleId(scheduleId: string): Promise<ScheduleSnooze[]> {
    const now = new Date();
    return this.prisma.scheduleSnooze.findMany({
      where: {
        scheduleId,
        runAt: {
          gt: now, // Only future snoozes
        },
      },
      orderBy: {
        runAt: "asc",
      },
    });
  }

  /**
   * Find active snoozes for a user
   */
  async findActiveByUserId(userId: string): Promise<
    (ScheduleSnooze & {
      schedule: { id: string; emoji: string | null; message: string } | null;
    })[]
  > {
    const now = new Date();
    return this.prisma.scheduleSnooze.findMany({
      where: {
        userId,
        runAt: {
          gt: now, // Only future snoozes
        },
      },
      include: {
        schedule: {
          select: {
            id: true,
            emoji: true,
            message: true,
          },
        },
      },
      orderBy: {
        runAt: "asc",
      },
    });
  }

  /**
   * Find all pending snoozes (for worker)
   */
  async findPendingSnoozes(): Promise<ScheduleSnooze[]> {
    const now = new Date();
    return this.prisma.scheduleSnooze.findMany({
      where: {
        runAt: {
          lte: now, // Snoozes that should be executed now or in the past
        },
      },
      orderBy: {
        runAt: "asc",
      },
    });
  }

  /**
   * Delete snooze after execution
   */
  async deleteSnooze(id: string): Promise<void> {
    // Delete worker jobs for this snooze
    const jobKeyPattern = `snooze:${id}`;
    try {
      await this.graphileWorkerService.deleteJobsByKeyPattern(jobKeyPattern);
      logger.info({ snoozeId: id }, "Deleted worker jobs for snooze");
    } catch (error) {
      logger.error(
        { err: error, snoozeId: id },
        "Failed to delete worker jobs for snooze"
      );
      // Continue with deletion even if job deletion fails
    }

    await this.prisma.scheduleSnooze.delete({
      where: { id },
    });

    logger.info({ snoozeId: id }, "Deleted snooze");
  }

  /**
   * Cancel all snoozes for a schedule
   */
  async cancelSnoozesByScheduleId(scheduleId: string): Promise<number> {
    const snoozes = await this.prisma.scheduleSnooze.findMany({
      where: { scheduleId },
    });

    if (snoozes.length === 0) {
      return 0;
    }

    // Delete worker jobs for each snooze
    for (const snooze of snoozes) {
      const jobKeyPattern = `snooze:${snooze.id}`;
      try {
        await this.graphileWorkerService.deleteJobsByKeyPattern(jobKeyPattern);
      } catch (error) {
        logger.error(
          { err: error, snoozeId: snooze.id, scheduleId },
          "Failed to delete worker jobs for snooze"
        );
        // Continue with deletion even if job deletion fails
      }
    }

    // Delete all snoozes from database
    const deleteResult = await this.prisma.scheduleSnooze.deleteMany({
      where: { scheduleId },
    });

    logger.info(
      { scheduleId, deletedCount: deleteResult.count },
      "Canceled all snoozes for schedule"
    );

    return deleteResult.count;
  }
}
