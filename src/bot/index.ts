import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { BotDependencies } from "./types";
import { StartHandler } from "./handlers/start.handler";
import { TimezoneHandler } from "./handlers/timezone.handler";
import { AdminHandler } from "./handlers/admin.handler";
import { TextMessageHandler } from "./handlers/text-message.handler";
import { VoiceMessageHandler } from "./handlers/voice-message.handler";
import { UserCommandsHandler } from "./handlers/list.handler";
import { SnoozeCallbackHandler } from "./handlers/snooze-callback.handler";
import { ParserConfirmHandler } from "./handlers/parser-confirm.handler";
import { UserTextInputProcessor } from "./processors/user-text-input.processor";
// import { ScheduleActionProcessor } from "./processors/schedule-action.processor";
import { MessageService } from "@/services/message.service";
import { logger } from "@/utils/logger";
import { LIST_COMMANDS } from "@/config/constants";

export const startBot = (deps: BotDependencies) => {
  if (!deps.telegramToken) {
    throw new Error("Telegram token is required");
  }

  const bot = new Telegraf(deps.telegramToken);
  logger.info("Bot created");

  const messageService = new MessageService(bot);

  const userTextInputProcessor = new UserTextInputProcessor({
    focusService: deps.focusService,
    chatMessageService: deps.chatMessageService,
    scheduleService: deps.scheduleService,
    scheduleSnoozeService: deps.scheduleSnoozeService,
    aiRequestService: deps.aiRequestService,
    graphileWorkerService: deps.graphileWorkerService,
    messageService,
  });

  const startHandler = new StartHandler({
    userService: deps.userService,
    focusService: deps.focusService,
    chatMessageService: deps.chatMessageService,
    messageService,
  });

  const timezoneHandler = new TimezoneHandler({
    userService: deps.userService,
    messageService,
  });

  const adminHandler = new AdminHandler({
    userService: deps.userService,
    chatMessageService: deps.chatMessageService,
    aiRequestService: deps.aiRequestService,
    settingService: deps.settingService,
    scheduleService: deps.scheduleService,
    messageService,
  });

  const userCommandsHandler = new UserCommandsHandler({
    userService: deps.userService,
    scheduleService: deps.scheduleService,
    scheduleSnoozeService: deps.scheduleSnoozeService,
    messageService,
  });

  const textMessageHandler = new TextMessageHandler({
    userService: deps.userService,
    messageService,
    userTextInputProcessor,
  });

  const voiceMessageHandler = new VoiceMessageHandler({
    userService: deps.userService,
    messageService,
    graphileWorkerService: deps.graphileWorkerService,
  });

  const snoozeCallbackHandler = new SnoozeCallbackHandler({
    scheduleSnoozeService: deps.scheduleSnoozeService,
    scheduleService: deps.scheduleService,
    userService: deps.userService,
    messageService,
    chatMessageService: deps.chatMessageService,
    focusService: deps.focusService,
  });

  const parserConfirmHandler = new ParserConfirmHandler({
    userService: deps.userService,
    focusService: deps.focusService,
    chatMessageService: deps.chatMessageService,
    scheduleService: deps.scheduleService,
    aiRequestService: deps.aiRequestService,
    graphileWorkerService: deps.graphileWorkerService,
    messageService,
  });

  bot.command("start", (ctx) => startHandler.handle(ctx));
  bot.command("timezone", (ctx) => timezoneHandler.handle(ctx));
  bot.command("users", (ctx) => adminHandler.handleUsers(ctx));
  bot.command("messages", (ctx) => adminHandler.handleMessages(ctx));
  bot.command("requests", (ctx) => adminHandler.handleAiRequests(ctx));
  bot.command("list", (ctx) => userCommandsHandler.handleList(ctx));
  bot.command("health", (ctx) => adminHandler.handleHealth(ctx));
  bot.command("version", (ctx) => adminHandler.handleVersion(ctx));
  bot.command("settings", (ctx) => adminHandler.handleSettings(ctx));
  bot.command("removeallmytasks", (ctx) =>
    adminHandler.handleRemoveAllMyTasks(ctx)
  );

  bot.on(message("voice"), (ctx) => voiceMessageHandler.handle(ctx));

  bot.on(message("text"), (ctx) => {
    const entities = ctx.message.entities || [];
    const isCommand = entities.some((e) => e.type === "bot_command");
    if (isCommand) return; // skip commands

    if (LIST_COMMANDS.includes(ctx.message.text.toLowerCase())) {
      userCommandsHandler.handleList(ctx);
      return;
    }

    textMessageHandler.handle(ctx);
  });

  // Handle callback queries for snooze buttons and dismiss
  bot.on("callback_query", (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const callbackData = ctx.callbackQuery.data;
    if (typeof callbackData === "string") {
      if (
        callbackData.startsWith("snooze:") ||
        callbackData.startsWith("snooze_custom:") ||
        callbackData.startsWith("dismiss:")
      ) {
        snoozeCallbackHandler.handle(ctx);
      } else if (callbackData.startsWith("parser:")) {
        parserConfirmHandler.handle(ctx);
      }
    }
  });

  bot.launch().catch((e) => {
    logger.error(
      { err: e instanceof Error ? e : new Error(String(e)) },
      "Failed to launch bot"
    );
  });

  return { bot, userTextInputProcessor };
};
