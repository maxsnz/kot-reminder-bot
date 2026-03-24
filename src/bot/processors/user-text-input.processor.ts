import { User, MessageRole, MessageType } from "@/prisma/generated/client";
import { FocusService } from "@/services/focus.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { ScheduleService } from "@/services/schedule.service";
import { ScheduleSnoozeService } from "@/services/scheduleSnooze.service";
import { AiRequestService } from "@/services/aiRequest.service";
import { GraphileWorkerService } from "@/services/graphileWorker.service";
import { MessageService } from "@/services/message.service";
import { getUserSchedulePrompt } from "@/bot/prompt";
import { getUserTime } from "@/utils/getUserTime";
import { tryParseMessage } from "@/bot/parser/index";
import { parseSnoozeInput } from "@/bot/parser/parseSnoozeInput";
import { formatSnoozeConfirmation } from "@/utils/formatScheduleConfirmation";
import { logger } from "@/utils/logger";

export interface UserTextInputProcessorDeps {
  focusService: FocusService;
  chatMessageService: ChatMessageService;
  scheduleService: ScheduleService;
  scheduleSnoozeService: ScheduleSnoozeService;
  aiRequestService: AiRequestService;
  graphileWorkerService: GraphileWorkerService;
  messageService: MessageService;
}

export class UserTextInputProcessor {
  constructor(private deps: UserTextInputProcessorDeps) {}

  async process(
    user: User,
    chatId: number,
    text: string,
    telegramMessageId: string,
    replyToMessageId?: string
  ): Promise<void> {
    // Handle custom snooze reply
    if (replyToMessageId) {
      const snoozePrompt = await this.deps.chatMessageService.findByTelegramMessageId(
        replyToMessageId,
        chatId.toString()
      );
      if (snoozePrompt?.messageType === MessageType.snooze_prompt && snoozePrompt.scheduleId) {
        if (!user.timezone) {
          await this.deps.messageService.sendMessage(chatId, "Ошибка: не установлен часовой пояс");
          return;
        }
        const result = parseSnoozeInput(text, user.timezone, new Date());
        if (result.ok) {
          const schedule = await this.deps.scheduleService.findById(snoozePrompt.scheduleId);
          if (!schedule) {
            await this.deps.messageService.sendMessage(chatId, "Ошибка: напоминание не найдено");
            return;
          }
          await this.deps.scheduleSnoozeService.createSnooze({
            scheduleId: snoozePrompt.scheduleId,
            userId: user.id,
            message: schedule.message,
            runAt: result.runAt,
          });
          const confirmationText = formatSnoozeConfirmation(result.runAt, schedule.message, user.timezone);
          await this.deps.messageService.sendMessage(chatId, confirmationText);
        } else {
          const errorText =
            result.reason === "time_in_past"
              ? "Это время уже прошло, попробуйте ещё раз"
              : result.reason === "ambiguous_time"
                ? "Уточните время: утро или вечер?"
                : "Не понял, уточните: например, через 2 часа или завтра в 10 утра";
          const newPrompt = await this.deps.messageService.sendMessage(chatId, errorText, {
            reply_markup: { force_reply: true, selective: true },
          });
          if (newPrompt) {
            await this.deps.chatMessageService.createMessage({
              userId: user.id,
              telegramChatId: chatId.toString(),
              telegramMessageId: newPrompt.message_id.toString(),
              role: MessageRole.system,
              messageType: MessageType.snooze_prompt,
              text: errorText,
              scheduleId: snoozePrompt.scheduleId,
            });
          }
        }
        return;
      }
    }

    const focus = await this.deps.focusService.findByUserId(user.id);
    if (!focus) throw new Error("Focus not found");

    // Save user message
    const userMessage = await this.deps.chatMessageService.createMessage({
      userId: user.id,
      telegramChatId: chatId.toString(),
      telegramMessageId,
      role: MessageRole.user,
      text,
      focusId: focus.id,
    });

    // Try parser first (skip if no timezone)
    if (user.timezone) {
      const parsed = tryParseMessage(text, user.timezone);

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
        await this.deps.messageService.sendMessageWithInlineKeyboard(
          chatId,
          confirmText,
          {
            inline_keyboard: [[
              { text: "❌", callback_data: `parser:cancel:${telegramMessageId}` },
              { text: "🤖", callback_data: `parser:ai:${telegramMessageId}` },
              { text: "✅", callback_data: `parser:confirm:${telegramMessageId}` },
            ]],
          }
        );
        return;
      }
    }

    // Build AI prompt and enqueue
    const schedules = await this.deps.scheduleService.findActiveByUserId(user.id);
    const userTime = user.timezone ? getUserTime(user.timezone) : "неизвестно";
    const focusMessages = await this.deps.chatMessageService.getMessagesByFocusId(focus.id);
    const context = focusMessages.map((m) => `${m.role}: ${m.text}`).join("\n");
    const schedule = await this.deps.focusService.getSchedule(focus.id);

    const prompt = getUserSchedulePrompt({ userTime, userInput: text, context, schedule, schedules });

    logger.debug({ prompt }, "Generated prompt for AI");

    const aiRequest = await this.deps.aiRequestService.create({
      userId: user.id,
      prompt: {
        userId: user.id,
        chatId,
        messageText: text,
        focusId: focus.id,
        userMessageId: userMessage.id,
        context,
        schedule,
        schedules,
        userTime,
        prompt,
      },
    });

    logger.info({ aiRequestId: aiRequest.id, model: "gpt-5-nano", prompt }, "Created AiRequest");

    await this.deps.graphileWorkerService.addJob("ai-request", { aiRequestId: aiRequest.id });
  }
}
