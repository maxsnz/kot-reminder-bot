import { Context } from "telegraf";
import { Markup } from "telegraf";
import { ScheduleService } from "@/services/schedule.service";
import { UserService } from "@/services/user.service";
import { FocusService } from "@/services/focus.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { MessageService } from "@/services/message.service";
import { MessageRole } from "@/prisma/generated/client";
import { formatScheduleList } from "@/utils/formatScheduleList";
import { logger } from "@/utils/logger";

export interface ScheduleCallbackHandlerDependencies {
  scheduleService: ScheduleService;
  userService: UserService;
  focusService: FocusService;
  chatMessageService: ChatMessageService;
  messageService: MessageService;
}

export class ScheduleCallbackHandler {
  constructor(private deps: ScheduleCallbackHandlerDependencies) {}

  async handle(ctx: Context) {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return;

    const callbackData = ctx.callbackQuery.data;
    const chatId = ctx.callbackQuery.message?.chat.id;

    if (!chatId) {
      await ctx.answerCbQuery("Ошибка: не удалось определить чат");
      return;
    }

    if (callbackData.startsWith("schedule_view:")) {
      await this.handleView(ctx, callbackData, chatId);
    } else if (callbackData.startsWith("schedule_delete:")) {
      await this.handleDelete(ctx, callbackData, chatId);
    } else if (callbackData.startsWith("schedule_edit:")) {
      await this.handleEdit(ctx, callbackData, chatId);
    }
  }

  private async handleView(ctx: Context, callbackData: string, chatId: number) {
    const scheduleId = callbackData.replace("schedule_view:", "");

    try {
      const user = await this.deps.userService.findByChatId(chatId);
      if (!user) {
        await ctx.answerCbQuery("Ошибка: пользователь не найден");
        return;
      }

      const schedule = await this.deps.scheduleService.findById(scheduleId);
      if (!schedule || schedule.userId !== user.id) {
        await ctx.answerCbQuery("Напоминание не найдено");
        return;
      }

      const timezone = user.timezone || "UTC";
      const text = formatScheduleList(schedule, timezone);

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback("✏️ Изменить", `schedule_edit:${scheduleId}`),
        Markup.button.callback("🗑 Удалить", `schedule_delete:${scheduleId}`),
      ]);

      await this.deps.messageService.sendMarkdownV2(chatId, text, {
        reply_markup: keyboard.reply_markup,
      });

      await ctx.answerCbQuery();
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)), callbackData },
        "Failed to process schedule_view callback"
      );
      await ctx.answerCbQuery("Ошибка");
    }
  }

  private async handleDelete(ctx: Context, callbackData: string, chatId: number) {
    const scheduleId = callbackData.replace("schedule_delete:", "");
    const messageId =
      ctx.callbackQuery && "message" in ctx.callbackQuery && ctx.callbackQuery.message
        ? ctx.callbackQuery.message.message_id
        : undefined;

    try {
      const user = await this.deps.userService.findByChatId(chatId);
      if (!user) {
        await ctx.answerCbQuery("Ошибка: пользователь не найден");
        return;
      }

      const schedule = await this.deps.scheduleService.findById(scheduleId);
      if (!schedule || schedule.userId !== user.id) {
        await ctx.answerCbQuery("Напоминание не найдено");
        return;
      }

      await this.deps.scheduleService.cancelSchedule(scheduleId);

      if (messageId) {
        await this.deps.messageService.removeInlineKeyboard(chatId, messageId);
      }

      const emoji = schedule.emoji || "🔘";
      const action = schedule.actionSummary || schedule.message;
      await this.deps.messageService.sendMessage(
        chatId,
        `${emoji} ${action} — удалено ✓`
      );

      await ctx.answerCbQuery("Удалено");
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)), callbackData },
        "Failed to process schedule_delete callback"
      );
      await ctx.answerCbQuery("Ошибка при удалении");
    }
  }

  private async handleEdit(ctx: Context, callbackData: string, chatId: number) {
    const scheduleId = callbackData.replace("schedule_edit:", "");
    const messageId =
      ctx.callbackQuery && "message" in ctx.callbackQuery && ctx.callbackQuery.message
        ? ctx.callbackQuery.message.message_id
        : undefined;

    try {
      const user = await this.deps.userService.findByChatId(chatId);
      if (!user) {
        await ctx.answerCbQuery("Ошибка: пользователь не найден");
        return;
      }

      const schedule = await this.deps.scheduleService.findById(scheduleId);
      if (!schedule || schedule.userId !== user.id) {
        await ctx.answerCbQuery("Напоминание не найдено");
        return;
      }

      // Set focus to this schedule so AI knows context
      let focus = await this.deps.focusService.findByScheduleId(scheduleId);
      if (!focus) {
        focus = await this.deps.focusService.createFocus();
        await this.deps.focusService.setSchedule(focus.id, scheduleId);
      }
      await this.deps.userService.setFocus(user.id, focus.id);

      if (messageId) {
        await this.deps.messageService.removeInlineKeyboard(chatId, messageId);
      }

      const emoji = schedule.emoji || "🔘";
      const action = schedule.actionSummary || schedule.message;
      const prompt = await this.deps.messageService.sendMessage(
        chatId,
        `${emoji} ${action}\n\nЧто изменить?`,
        { reply_markup: { force_reply: true, selective: true } }
      );

      if (prompt) {
        await this.deps.chatMessageService.createMessage({
          userId: user.id,
          telegramChatId: chatId.toString(),
          telegramMessageId: prompt.message_id.toString(),
          role: MessageRole.system,
          text: `Что изменить?`,
          scheduleId,
          focusId: focus.id,
        });
      }

      await ctx.answerCbQuery();
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)), callbackData },
        "Failed to process schedule_edit callback"
      );
      await ctx.answerCbQuery("Ошибка");
    }
  }
}
