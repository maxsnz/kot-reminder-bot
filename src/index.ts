import { startBot } from "./bot";
import { DatabaseService } from "./services/database.service";
import { UserService } from "./services/user.service";
import { env } from "./config/env";
import { ChatMessageService } from "./services/chatMessage.service";
import { FocusService } from "./services/focus.service";
import { ScheduleService } from "./services/schedule.service";
import { ScheduleSnoozeService } from "./services/scheduleSnooze.service";
import { AIService } from "./services/ai.service";
import { AiRequestService } from "./services/aiRequest.service";
import { GraphileWorkerService } from "./services/graphileWorker.service";
import { SettingService } from "./services/setting.service";
import { MessageService } from "./services/message.service";
import { createAiRequestTask } from "./workers/ai-request.worker";
import { createAiResultTask } from "./workers/ai-result.worker";
import { createScheduleReminderTask } from "./workers/schedule-reminder.worker";
import { createScheduleSnoozeTask } from "./workers/schedule-snooze.worker";
import { createVoiceTranscriptionTask } from "./workers/voice-transcription.worker";
import { AiResultProcessor } from "./bot/processors/ai-result.processor";
import { ScheduleActionProcessor } from "./bot/processors/schedule-action.processor";
import { logger } from "./utils/logger";
import { writeFileSync } from "node:fs";

async function main() {
  const databaseService = new DatabaseService();
  await databaseService.connect();

  const dbClient = databaseService.getClient();

  const userService = new UserService(dbClient);
  const chatMessageService = new ChatMessageService(dbClient);
  const focusService = new FocusService(dbClient);
  const graphileWorkerService = new GraphileWorkerService(dbClient);
  const scheduleService = new ScheduleService(dbClient, graphileWorkerService);
  const scheduleSnoozeService = new ScheduleSnoozeService(
    dbClient,
    graphileWorkerService
  );
  const settingService = new SettingService(dbClient);
  const aiService = new AIService({
    openaiApiKey: env.OPENAI_API_KEY,
    settingService,
  });
  const aiRequestService = new AiRequestService(dbClient);

  const telegramToken = env.TELEGRAM_TOKEN;
  const { bot, userTextInputProcessor } = startBot({
    userService,
    telegramToken,
    chatMessageService,
    focusService,
    scheduleService,
    scheduleSnoozeService,
    aiRequestService,
    graphileWorkerService,
    settingService,
  });

  const messageService = new MessageService(bot);

  // Initialize schedule action processor
  const scheduleActionProcessor = new ScheduleActionProcessor({
    scheduleService,
    focusService,
    userService,
  });

  // Initialize AI result processor
  const aiResultProcessor = new AiResultProcessor({
    userService,
    focusService,
    chatMessageService,
    scheduleService,
    scheduleActionProcessor,
    messageService,
  });

  // Start Graphile Worker with task list
  const taskList = {
    "ai-request": createAiRequestTask(
      aiRequestService,
      aiService,
      graphileWorkerService,
      messageService,
      bot
    ),
    "ai-result": createAiResultTask(
      aiRequestService,
      aiResultProcessor,
      messageService
    ),
    "schedule-reminder": createScheduleReminderTask(
      scheduleService,
      chatMessageService,
      focusService,
      userService,
      graphileWorkerService,
      messageService
    ),
    "schedule-snooze": createScheduleSnoozeTask(
      scheduleSnoozeService,
      messageService
    ),
    "voice-transcription": createVoiceTranscriptionTask(
      aiService,
      userService,
      messageService,
      userTextInputProcessor,
      bot,
      telegramToken
    ),
  };

  await graphileWorkerService.start(taskList);

  logger.info("Reminder bot started");

  // Liveness heartbeat: refresh a file every 15s so the container healthcheck
  // can confirm the event loop is actually running — not just that a `bun`
  // process exists as PID 1 (which stays true even if the loop is wedged). The
  // bot-dead case is handled by process.exit(1) in startBot()'s launch().catch;
  // this guards against a silently stalled event loop.
  const HEARTBEAT_FILE = "/tmp/reminder-heartbeat";
  const writeHeartbeat = () => {
    try {
      writeFileSync(HEARTBEAT_FILE, String(Date.now()));
    } catch (err) {
      logger.warn({ err }, "Failed to write heartbeat file");
    }
  };
  writeHeartbeat();
  setInterval(writeHeartbeat, 15_000).unref();

  const gracefulShutdown = async (signal: string) => {
    logger.info({ signal }, "Received signal, shutting down gracefully...");
    await graphileWorkerService.stop();
    await bot.stop(signal);
    await databaseService.disconnect();
    process.exit(0);
  };

  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error(error, "Failed to start application");
  process.exit(1);
});
