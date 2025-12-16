import { Telegraf } from "telegraf";
import { AiRequest } from "@/prisma/generated/client";
import { UserService } from "@/services/user.service";
import { FocusService } from "@/services/focus.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { ScheduleService } from "@/services/schedule.service";
import { ScheduleActionProcessor } from "./schedule-action.processor";
import { MessageRole } from "@/prisma/generated/client";
import { formatScheduleConfirmation } from "@/utils/formatScheduleConfirmation";
import { formatScheduleList } from "@/utils/formatScheduleList";
import { logger } from "@/utils/logger";

export interface AiResultProcessorDependencies {
  bot: Telegraf;
  userService: UserService;
  focusService: FocusService;
  chatMessageService: ChatMessageService;
  scheduleService: ScheduleService;
  scheduleActionProcessor: ScheduleActionProcessor;
}

export class AiResultProcessor {
  constructor(private deps: AiResultProcessorDependencies) {}

  async processResult(aiRequest: AiRequest): Promise<void> {
    try {
      const promptData = aiRequest.prompt as any;
      if (!promptData) {
        throw new Error("Prompt data not found in AiRequest");
      }

      const userId = aiRequest.userId;
      const chatId = promptData.chatId as number;
      const messageText = promptData.messageText as string;
      const focusId = promptData.focusId as string;
      const userMessageId = promptData.userMessageId as string | undefined;

      if (!chatId) {
        throw new Error("chatId not found in prompt data");
      }

      const user = await this.deps.userService.findById(userId);

      let focus = await this.deps.focusService.findById(focusId);
      if (!focus) {
        throw new Error("Focus not found");
      }

      const result = aiRequest.responseJson as any;
      if (!result) {
        throw new Error("AI result not found in AiRequest");
      }

      logger.debug(
        { result, aiRequestId: aiRequest.id },
        "Processing AI result"
      );

      if (result.focus === "new") {
        focus = await this.deps.focusService.createFocus();
        await this.deps.userService.setFocus(user.id, focus.id);

        if (userMessageId) {
          await this.deps.chatMessageService.setFocus(userMessageId, focus.id);
        }
      }

      await this.deps.chatMessageService.createMessage({
        userId: user.id,
        telegramChatId: chatId.toString(),
        role: MessageRole.assistant,
        text: result.response ?? "",
        focusId: focus.id,
        aiAction: result,
      });

      const scheduleForConfirmation =
        await this.deps.scheduleActionProcessor.processAction(
          result,
          user.id,
          focus.id,
          messageText
        );

      if (result.action === "set_timezone" && result.timezone) {
        await this.deps.userService.updateUser(user.id, {
          timezone: result.timezone,
        });
      }

      if (result.action === "show_user_schedules") {
        const schedules = await this.deps.scheduleService.findActiveByUserId(
          user.id
        );
        const timezone = user.timezone || "UTC";
        const allSchedules = schedules
          .map((schedule) => formatScheduleList(schedule, timezone))
          .join("\n\n");
        await this.deps.bot.telegram.sendMessage(chatId, allSchedules, {
          parse_mode: "MarkdownV2",
        });
      }

      if (result.response) {
        await this.deps.bot.telegram.sendMessage(chatId, result.response);
      }

      if (scheduleForConfirmation && user.timezone) {
        const confirmationMessage = formatScheduleConfirmation(
          scheduleForConfirmation.schedule,
          user.timezone,
          scheduleForConfirmation.action
        );
        await this.deps.bot.telegram.sendMessage(chatId, confirmationMessage);
      }
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          aiRequestId: aiRequest.id,
        },
        "Error processing AI result"
      );
      throw error;
    }
  }
}
