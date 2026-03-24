import { Context } from "telegraf";
import { UserService } from "@/services/user.service";
import { FocusService } from "@/services/focus.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { MessageService } from "@/services/message.service";
import { ScheduleService } from "@/services/schedule.service";
import { AiRequestService } from "@/services/aiRequest.service";
import { GraphileWorkerService } from "@/services/graphileWorker.service";
import { MessageRole } from "@/prisma/generated/client";
import { tryParseMessage } from "@/bot/parser/index";
import { getUserSchedulePrompt } from "@/bot/prompt";
import { getUserTime } from "@/utils/getUserTime";
import { formatScheduleConfirmation } from "@/utils/formatScheduleConfirmation";
import { logger } from "@/utils/logger";

export interface ParserConfirmHandlerDependencies {
  userService: UserService;
  focusService: FocusService;
  chatMessageService: ChatMessageService;
  scheduleService: ScheduleService;
  aiRequestService: AiRequestService;
  graphileWorkerService: GraphileWorkerService;
  messageService: MessageService;
}

export class ParserConfirmHandler {
  constructor(private deps: ParserConfirmHandlerDependencies) {}

  async handle(ctx: Context) {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return;

    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.callbackQuery.message?.chat.id;
    const confirmationMessageId =
      ctx.callbackQuery.message && "message_id" in ctx.callbackQuery.message
        ? ctx.callbackQuery.message.message_id
        : undefined;

    if (!chatId) {
      await ctx.answerCbQuery("Ошибка: не удалось определить чат");
      return;
    }

    // parser:cancel:{telegramMessageId}
    // parser:ai:{telegramMessageId}
    // parser:confirm:{telegramMessageId}
    const match = callbackData.match(/^parser:(cancel|ai|confirm):(.+)$/);
    if (!match) {
      await ctx.answerCbQuery("Ошибка: неверный формат данных");
      return;
    }

    const [, action, telegramMessageId] = match;

    // Remove inline keyboard from confirmation message
    if (confirmationMessageId) {
      await this.deps.messageService.removeInlineKeyboard(chatId, confirmationMessageId);
    }

    if (action === "cancel") {
      await ctx.answerCbQuery();
      return;
    }

    const user = await this.deps.userService.findByChatId(chatId);
    if (!user) {
      await ctx.answerCbQuery("Ошибка: пользователь не найден");
      return;
    }

    // Fetch original user message
    const originalMessage = await this.deps.chatMessageService.findByTelegramMessageId(
      telegramMessageId,
      chatId.toString()
    );
    if (!originalMessage) {
      // Message not found (e.g. expired or DB cleared) — send fresh confirmation prompt
      await this.deps.messageService.sendMessage(chatId, "Сообщение не найдено, попробуйте отправить запрос ещё раз.");
      await ctx.answerCbQuery();
      return;
    }

    const messageText = originalMessage.text;
    const focusId = originalMessage.focusId;
    let focus = focusId ? await this.deps.focusService.findById(focusId) : null;
    if (!focus) {
      focus = await this.deps.focusService.findByUserId(user.id);
    }
    if (!focus) {
      await ctx.answerCbQuery("Ошибка: фокус не найден");
      return;
    }

    if (action === "ai") {
      // Queue AI request for original message
      try {
        const schedules = await this.deps.scheduleService.findActiveByUserId(user.id);
        const userTime = user.timezone ? getUserTime(user.timezone) : "неизвестно";
        const focusMessages = await this.deps.chatMessageService.getMessagesByFocusId(focus.id);
        const context = focusMessages
          .map((m) => `${m.role}: ${m.text}`)
          .join("\n");
        const schedule = await this.deps.focusService.getSchedule(focus.id);

        const prompt = getUserSchedulePrompt({
          userTime,
          userInput: messageText,
          context,
          schedule,
          schedules,
        });

        const aiRequest = await this.deps.aiRequestService.create({
          userId: user.id,
          prompt: {
            userId: user.id,
            chatId,
            messageText,
            focusId: focus.id,
            userMessageId: originalMessage.id,
            context,
            schedule,
            schedules,
            userTime,
            prompt,
          },
        });

        await this.deps.graphileWorkerService.addJob("ai-request", {
          aiRequestId: aiRequest.id,
        });

        await ctx.answerCbQuery();
      } catch (error) {
        logger.error(
          { err: error instanceof Error ? error : new Error(String(error)), callbackData },
          "Failed to queue AI request from parser confirm"
        );
        await ctx.answerCbQuery("Ошибка при отправке в AI");
      }
      return;
    }

    // action === "confirm": re-parse and create schedule directly
    if (!user.timezone) {
      await ctx.answerCbQuery("Ошибка: не установлен часовой пояс");
      return;
    }

    const parsed = tryParseMessage(messageText, user.timezone);
    if (!parsed.ok) {
      // Parse failed on confirmation (e.g. time became past) — re-send confirmation prompt
      if (parsed.reason === "time_in_past") {
        await this.deps.messageService.sendMessage(
          chatId,
          "Время уже прошло. Попробуйте ещё раз с актуальным временем."
        );
      } else {
        await this.deps.messageService.sendMessage(
          chatId,
          "Не удалось распознать запрос, попробуйте ещё раз."
        );
      }
      await ctx.answerCbQuery();
      return;
    }

    try {
      const { schedule: scheduleData } = parsed.result;

      // Create schedule
      const schedule = await this.deps.scheduleService.createScheduleFromAIResponse(
        user.id,
        scheduleData as any,
        messageText,
        user.timezone
      );
      await this.deps.focusService.setSchedule(focus.id, schedule.id);

      // Send confirmation
      const confirmationMessage = formatScheduleConfirmation(schedule, user.timezone, "create");
      const sentMessage = await this.deps.messageService.sendMessage(chatId, confirmationMessage);

      if (sentMessage) {
        await this.deps.chatMessageService.createMessage({
          userId: user.id,
          telegramChatId: chatId.toString(),
          telegramMessageId: sentMessage.message_id.toString(),
          role: MessageRole.system,
          text: confirmationMessage,
          scheduleId: schedule.id,
          focusId: focus.id,
        });
      }

      await ctx.answerCbQuery();
      logger.info(
        { userId: user.id, scheduleId: schedule.id, messageText },
        "Schedule created via parser confirm"
      );
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)), callbackData },
        "Failed to create schedule from parser confirm"
      );
      await ctx.answerCbQuery("Ошибка при создании напоминания");
    }
  }
}
