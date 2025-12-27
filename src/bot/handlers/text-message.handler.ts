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

export interface TextMessageHandlerDependencies {
  userService: UserService;
  focusService: FocusService;
  chatMessageService: ChatMessageService;
  scheduleService: ScheduleService;
  aiRequestService: AiRequestService;
  graphileWorkerService: GraphileWorkerService;
  messageService: MessageService;
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

      let focus = await this.deps.focusService.findByUserId(user.id);
      if (!focus) {
        throw new Error("Focus not found");
      }

      // Save user message
      const userMessage = await this.deps.chatMessageService.createMessage({
        userId: user.id,
        telegramChatId: chatId.toString(),
        role: MessageRole.user,
        text: messageText,
        focusId: focus.id,
      });

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
