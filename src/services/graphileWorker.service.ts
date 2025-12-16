import { run, Runner, TaskList, quickAddJob } from "graphile-worker";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

export class GraphileWorkerService {
  private runner: Runner | null = null;
  private isStarted = false;

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
}
