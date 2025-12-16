import { run, Runner, TaskList, quickAddJob } from "graphile-worker";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { PrismaClient } from "@/prisma/generated/client";

export class GraphileWorkerService {
  private runner: Runner | null = null;
  private isStarted = false;

  constructor(private prisma: PrismaClient) {}

  async start(taskList: TaskList): Promise<void> {
    if (this.isStarted) {
      logger.warn("GraphileWorker is already started");
      return;
    }

    try {
      this.runner = await run({
        connectionString: env.DATABASE_URL,
        taskList,
        concurrency: 5,
        // Disable crontab file reading - we don't use cron scheduling
        parsedCronItems: [],
      });

      this.isStarted = true;
      logger.info("GraphileWorker started successfully");
    } catch (error) {
      logger.error({ err: error }, "Failed to start GraphileWorker");
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted || !this.runner) {
      return;
    }

    try {
      await this.runner.stop();
      this.isStarted = false;
      this.runner = null;
      logger.info("GraphileWorker stopped successfully");
    } catch (error) {
      logger.error({ err: error }, "Failed to stop GraphileWorker");
      throw error;
    }
  }

  // Add job to queue (using graphile-worker's quickAddJob function)
  async addJob(
    taskIdentifier: string,
    payload: any,
    options?: {
      queueName?: string;
      runAt?: Date;
      maxAttempts?: number;
      jobKey?: string;
      jobKeyMode?: "replace" | "preserve_run_at" | "unsafe_dedupe";
    }
  ): Promise<void> {
    await quickAddJob(
      {
        connectionString: env.DATABASE_URL,
      },
      taskIdentifier,
      payload,
      options
    );
  }

  isRunning(): boolean {
    return this.isStarted && this.runner !== null;
  }

  // Delete jobs by jobKey (exact match) or pattern (e.g., "schedule:abc123" or "schedule:%")
  async deleteJobsByKeyPattern(pattern: string): Promise<number> {
    try {
      // Use LIKE for pattern matching (supports % wildcards) or exact match
      // Note: graphile-worker stores job keys in the 'key' column, not 'job_key'
      const result = await this.prisma.$executeRaw`
        DELETE FROM graphile_worker.jobs
        WHERE key LIKE ${pattern}
      `;
      logger.info(
        { pattern, deletedCount: result },
        "Deleted jobs by key pattern"
      );
      return result;
    } catch (error) {
      logger.error(
        { err: error, pattern },
        "Failed to delete jobs by key pattern"
      );
      throw error;
    }
  }
}
