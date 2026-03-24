import { Context } from "telegraf";
import { UserService } from "@/services/user.service";
import { FocusService } from "@/services/focus.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { MessageService } from "@/services/message.service";
import { getUserSchedulePrompt } from "@/bot/prompt";
import { getUserTime } from "@/utils/getUserTime";
import { MessageRole } from "@/prisma/generated/client";
import { ScheduleService } from "@/services/schedule.service";
import { logger } from "@/utils/logger";
import { AiRequestService } from "@/services/aiRequest.service";
import { GraphileWorkerService } from "@/services/graphileWorker.service";
import { tryParseMessage } from "@/bot/parser/index";
import { ScheduleSnoozeService } from "@/services/scheduleSnooze.service";
import { CustomSnoozeStateStore } from "@/bot/state/customSnoozeState";
import { parseSnoozeInput } from "@/bot/parser/parseSnoozeInput";
import { formatSnoozeConfirmation } from "@/utils/formatScheduleConfirmation";

export interface TextMessageHandlerDependencies {
  userService: UserService;
  focusService: FocusService;
  chatMessageService: ChatMessageService;
  scheduleService: ScheduleService;
  aiRequestService: AiRequestService;
  graphileWorkerService: GraphileWorkerService;
  messageService: MessageService;
  scheduleSnoozeService: ScheduleSnoozeService;
  customSnoozeState: CustomSnoozeStateStore;
}

export class TextMessageHandler {
  constructor(private deps: TextMessageHandlerDependencies) {}

  async handle(ctx: Context) {
    try {
      if (!ctx.message || !("text" in ctx.message)) return;

      const chatId = ctx.message.chat.id;
      const messageText = ctx.message.text;
      if (!messageText) return;

      const user = await this.deps.userService.findByChatId(chatId);
      if (!user) {
        await this.deps.messageService.sendMessage(
          chatId,
          `Привет, кажется мы не знакомы. Чтобы начать, пожалуйста, отправь команду /start`
        );
        return;
      }

      // Handle pending custom snooze input
      const pendingSnooze = this.deps.customSnoozeState.get(user.id);
      if (pendingSnooze) {
        if (!user.timezone) {
          await this.deps.messageService.sendMessage(chatId, "Ошибка: не установлен часовой пояс");
          return;
        }
        const result = parseSnoozeInput(messageText, user.timezone, new Date());
        if (result.ok) {
          const schedule = await this.deps.scheduleService.findById(pendingSnooze.scheduleId);
          if (!schedule) {
            this.deps.customSnoozeState.delete(user.id);
            await this.deps.messageService.sendMessage(chatId, "Ошибка: напоминание не найдено");
            return;
          }
          await this.deps.scheduleSnoozeService.createSnooze({
            scheduleId: pendingSnooze.scheduleId,
            userId: user.id,
            message: schedule.message,
            runAt: result.runAt,
          });
          await this.deps.messageService.removeInlineKeyboard(pendingSnooze.chatId, pendingSnooze.promptMessageId);
          this.deps.customSnoozeState.delete(user.id);
          const confirmationText = formatSnoozeConfirmation(result.runAt, schedule.message, user.timezone);
          await this.deps.messageService.sendMessage(chatId, confirmationText);
        } else if (result.reason === "time_in_past") {
          await this.deps.messageService.sendMessageWithInlineKeyboard(
            chatId,
            "Это время уже прошло, попробуйте ещё раз",
            { inline_keyboard: [[{ text: "Отмена", callback_data: `snooze_custom_cancel:${pendingSnooze.scheduleId}` }]] }
          );
        } else if (result.reason === "ambiguous_time") {
          await this.deps.messageService.sendMessageWithInlineKeyboard(
            chatId,
            "Уточните время: утро или вечер?",
            { inline_keyboard: [[{ text: "Отмена", callback_data: `snooze_custom_cancel:${pendingSnooze.scheduleId}` }]] }
          );
        } else {
          await this.deps.messageService.sendMessageWithInlineKeyboard(
            chatId,
            "Не понял, уточните: например, через 2 часа или завтра в 10 утра",
            { inline_keyboard: [[{ text: "Отмена", callback_data: `snooze_custom_cancel:${pendingSnooze.scheduleId}` }]] }
          );
        }
        return;
      }

      let focus = await this.deps.focusService.findByUserId(user.id);
      if (!focus) {
        throw new Error("Focus not found");
      }

      // Save user message
      const userMessage = await this.deps.chatMessageService.createMessage({
        userId: user.id,
        telegramChatId: chatId.toString(),
        telegramMessageId: ctx.message.message_id.toString(),
        role: MessageRole.user,
        text: messageText,
        focusId: focus.id,
      });

      // Try parser first (skip if no timezone)
      if (user.timezone) {
        const parsed = tryParseMessage(messageText, user.timezone);

        if (!parsed.ok && parsed.reason === "no_text") {
          const replyText = "Уточните запрос";
          const sentMessage = await this.deps.messageService.sendMessage(chatId, replyText);
          await this.deps.chatMessageService.createMessage({
            userId: user.id,
            telegramChatId: chatId.toString(),
            telegramMessageId: sentMessage?.message_id.toString() ?? null,
            role: MessageRole.system,
            text: replyText,
            focusId: focus.id,
          });
          return;
        }

        if (parsed.ok) {
          const { schedule } = parsed.result;
          const confirmText = `${schedule.emoji} ${schedule.summary}\n\nПодтвердить?`;
          const msgId = ctx.message.message_id.toString();
          await this.deps.messageService.sendMessageWithInlineKeyboard(
            chatId,
            confirmText,
            {
              inline_keyboard: [[
                { text: "❌", callback_data: `parser:cancel:${msgId}` },
                { text: "🤖", callback_data: `parser:ai:${msgId}` },
                { text: "✅", callback_data: `parser:confirm:${msgId}` },
              ]],
            }
          );
          return;
        }
      }

      // Prepare data for AI request
      const schedules = await this.deps.scheduleService.findActiveByUserId(
        user.id
      );
      const userTime = user.timezone
        ? getUserTime(user.timezone)
        : "неизвестно";

      const focusMessages =
        await this.deps.chatMessageService.getMessagesByFocusId(focus.id);
      const context = focusMessages
        .map((message) => `${message.role}: ${message.text}`)
        .join("\n");
      const schedule = await this.deps.focusService.getSchedule(focus.id);

      const prompt = getUserSchedulePrompt({
        userTime,
        userInput: messageText,
        context,
        schedule,
        schedules,
      });

      logger.debug({ prompt }, "Generated prompt for AI");

      // Create AiRequest with all necessary data
      const aiRequest = await this.deps.aiRequestService.create({
        userId: user.id,
        prompt: {
          userId: user.id,
          chatId: chatId,
          messageText: messageText,
          focusId: focus.id,
          userMessageId: userMessage.id, // Save user message ID for focus update
          context: context,
          schedule: schedule,
          schedules: schedules,
          userTime: userTime,
          prompt: prompt,
        },
      });

      logger.info(
        {
          aiRequestId: aiRequest.id,
          model: "gpt-5-nano",
          prompt: prompt,
          userName: user.username,
          messageText,
        },
        "Created AiRequest"
      );

      // Send job to ai-request queue
      await this.deps.graphileWorkerService.addJob("ai-request", {
        aiRequestId: aiRequest.id,
      });
    } catch (e) {
      logger.error(
        {
          err: e instanceof Error ? e : new Error(String(e)),
        },
        "Error handling text message"
      );
      const chatId = ctx.message?.chat.id;
      if (chatId) {
        await this.deps.messageService.sendMessage(
          chatId,
          `Ошибка: ${e instanceof Error ? e.message : "Неизвестная ошибка"}`
        );
      }
    }
  }
}
