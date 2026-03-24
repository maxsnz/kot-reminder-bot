import { Context } from "telegraf";
import { ScheduleSnoozeService } from "@/services/scheduleSnooze.service";
import { ScheduleService } from "@/services/schedule.service";
import { UserService } from "@/services/user.service";
import { MessageService } from "@/services/message.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { FocusService } from "@/services/focus.service";
import { MessageRole } from "@/prisma/generated/client";
import { formatSnoozeConfirmation } from "@/utils/formatScheduleConfirmation";
import { logger } from "@/utils/logger";

export interface SnoozeCallbackHandlerDependencies {
  scheduleSnoozeService: ScheduleSnoozeService;
  scheduleService: ScheduleService;
  userService: UserService;
  messageService: MessageService;
  chatMessageService: ChatMessageService;
  focusService: FocusService;
}

export class SnoozeCallbackHandler {
  constructor(private deps: SnoozeCallbackHandlerDependencies) {}

  async handle(ctx: Context) {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return;
    }

    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.callbackQuery.message?.chat.id;
    const messageId =
      ctx.callbackQuery.message && "message_id" in ctx.callbackQuery.message
        ? ctx.callbackQuery.message.message_id
        : undefined;

    if (!chatId) {
      logger.error({ callbackData }, "Chat ID not found in callback query");
      await ctx.answerCbQuery("Ошибка: не удалось определить чат");
      return;
    }

    // Handle dismiss callback (just remove buttons)
    if (callbackData.startsWith("dismiss:")) {
      const dismissMatch = callbackData.match(/^dismiss:(.+)$/);
      if (dismissMatch && messageId) {
        const scheduleId = dismissMatch[1];
        try {
          // Verify schedule belongs to user
          const user = await this.deps.userService.findByChatId(chatId);
          if (user) {
            const schedule = await this.deps.scheduleService.findById(scheduleId);
            if (schedule && schedule.userId === user.id) {
              // Remove inline keyboard buttons
              await this.deps.messageService.removeInlineKeyboard(chatId, messageId);
              await ctx.answerCbQuery();
              return;
            }
          }
        } catch (error) {
          logger.error(
            {
              err: error instanceof Error ? error : new Error(String(error)),
              callbackData,
            },
            "Failed to process dismiss callback"
          );
        }
      }
      await ctx.answerCbQuery("Ошибка при скрытии кнопок");
      return;
    }

    // Parse callback data: snooze:{scheduleId}:{minutes}
    const match = callbackData.match(/^snooze:([^:]+):(\d+)$/);
    if (!match) {
      logger.error({ callbackData }, "Invalid callback data format");
      await ctx.answerCbQuery("Ошибка: неверный формат данных");
      return;
    }

    const [, scheduleId, minutesStr] = match;
    const minutes = parseInt(minutesStr, 10);

    if (isNaN(minutes) || minutes <= 0) {
      logger.error({ callbackData, minutes }, "Invalid minutes value");
      await ctx.answerCbQuery("Ошибка: неверное значение времени");
      return;
    }

    try {
      // Find user by chatId
      const user = await this.deps.userService.findByChatId(chatId);
      if (!user) {
        logger.error({ chatId }, "User not found");
        await ctx.answerCbQuery("Ошибка: пользователь не найден");
        return;
      }

      if (!user.timezone) {
        logger.error({ userId: user.id }, "User has no timezone set");
        await ctx.answerCbQuery(
          "Ошибка: не установлен часовой пояс. Используйте команду /timezone"
        );
        return;
      }

      // Find schedule
      const schedule = await this.deps.scheduleService.findById(scheduleId);
      if (!schedule) {
        logger.error({ scheduleId }, "Schedule not found");
        await ctx.answerCbQuery("Ошибка: напоминание не найдено");
        return;
      }

      // Verify schedule belongs to user
      if (schedule.userId !== user.id) {
        logger.error(
          { scheduleId, userId: user.id, scheduleUserId: schedule.userId },
          "Schedule does not belong to user"
        );
        await ctx.answerCbQuery("Ошибка: это не ваше напоминание");
        return;
      }

      // Calculate runAt time (current time + minutes)
      const runAt = new Date();
      runAt.setMinutes(runAt.getMinutes() + minutes);

      // Create snooze
      await this.deps.scheduleSnoozeService.createSnooze({
        scheduleId,
        userId: user.id,
        message: schedule.message,
        runAt,
      });

      // Remove inline keyboard buttons from the original message
      if (messageId) {
        await this.deps.messageService.removeInlineKeyboard(chatId, messageId);
      }

      // Format and send confirmation message
      const confirmationMessage = formatSnoozeConfirmation(
        runAt,
        schedule.message,
        user.timezone
      );
      const sentMessage = await this.deps.messageService.sendMessage(
        chatId,
        confirmationMessage
      );

      // Save confirmation message as system message
      if (sentMessage) {
        // Get focus for this schedule
        const focus = await this.deps.focusService.findByScheduleId(scheduleId);
        if (focus) {
          await this.deps.chatMessageService.createMessage({
            userId: user.id,
            telegramChatId: chatId.toString(),
            telegramMessageId: sentMessage.message_id?.toString() ?? null,
            role: MessageRole.system,
            text: confirmationMessage,
            scheduleId: schedule.id,
            focusId: focus.id,
          });
        } else {
          // If no focus found, use user's current focus
          const userFocus = await this.deps.userService.findById(user.id);
          if (userFocus?.focusId) {
            await this.deps.chatMessageService.createMessage({
              userId: user.id,
              telegramChatId: chatId.toString(),
              telegramMessageId: sentMessage.message_id?.toString() ?? null,
              role: MessageRole.system,
              text: confirmationMessage,
              scheduleId: schedule.id,
              focusId: userFocus.focusId,
            });
          }
        }
      }

      // Answer callback query
      await ctx.answerCbQuery();

      logger.info(
        {
          userId: user.id,
          scheduleId,
          minutes,
          runAt: runAt.toISOString(),
        },
        "Snooze created successfully"
      );
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          callbackData,
          scheduleId,
          minutes,
        },
        "Failed to process snooze callback"
      );
      await ctx.answerCbQuery("Ошибка при создании отложенного напоминания");
    }
  }
}
