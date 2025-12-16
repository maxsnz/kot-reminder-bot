import { startBot } from "./bot";
import { DatabaseService } from "./services/database.service";
import { UserService } from "./services/user.service";
import { env } from "./config/env";
import { ChatMessageService } from "./services/chatMessage.service";
import { FocusService } from "./services/focus.service";
import { ScheduleService } from "./services/schedule.service";
import { AIService } from "./services/ai.service";
import { AiRequestService } from "./services/aiRequest.service";
import { GraphileWorkerService } from "./services/graphileWorker.service";
import { SettingService } from "./services/setting.service";
import { MessageService } from "./services/message.service";
import { createAiRequestTask } from "./workers/ai-request.worker";
import { createAiResultTask } from "./workers/ai-result.worker";
import { createScheduleReminderTask } from "./workers/schedule-reminder.worker";
import { AiResultProcessor } from "./bot/processors/ai-result.processor";
import { ScheduleActionProcessor } from "./bot/processors/schedule-action.processor";
import { logger } from "./utils/logger";

async function main() {
  const databaseService = new DatabaseService();
  await databaseService.connect();

  const dbClient = databaseService.getClient();

  const userService = new UserService(dbClient);
  const chatMessageService = new ChatMessageService(dbClient);
  const focusService = new FocusService(dbClient);
  const graphileWorkerService = new GraphileWorkerService(dbClient);
  const scheduleService = new ScheduleService(dbClient, graphileWorkerService);
  const settingService = new SettingService(dbClient);
  const aiService = new AIService({
    openaiApiKey: env.OPENAI_API_KEY,
    settingService,
  });
  const aiRequestService = new AiRequestService(dbClient);

  const telegramToken = env.TELEGRAM_TOKEN;
  const bot = startBot({
    userService,
    telegramToken,
    chatMessageService,
    focusService,
    scheduleService,
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
  };

  await graphileWorkerService.start(taskList);

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
