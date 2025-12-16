import { Context } from "telegraf";
import { UserService } from "@/services/user.service";
import { FocusService } from "@/services/focus.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { MessageService } from "@/services/message.service";
import { getFullName, getUsername } from "@/utils/getUsername";
import { MessageRole } from "@/prisma/generated/client";
import { logger } from "@/utils/logger";

export interface StartHandlerDependencies {
  userService: UserService;
  focusService: FocusService;
  chatMessageService: ChatMessageService;
  messageService: MessageService;
}

export class StartHandler {
  constructor(private deps: StartHandlerDependencies) {}

  async handle(ctx: Context) {
    const chatId = ctx.message?.chat.id;
    if (!chatId || !("text" in ctx.message)) return;

    const username = getUsername(ctx.message.from);
    const fullName = getFullName(ctx.message.from);

    const focus = await this.deps.focusService.createFocus();
    const user = await this.deps.userService.ensureUser({
      chatId,
      username,
      fullName,
    });
    await this.deps.userService.setFocus(user.id, focus.id);

    await this.deps.chatMessageService.createMessage({
      userId: user.id,
      telegramChatId: chatId.toString(),
      role: MessageRole.user,
      text: "/start",
      focusId: focus.id,
    });

    const messageText = `Привет, ${fullName}! \nЯ могу помочь тебе устанавливать напоминания о важных событиях. Чтобы начать, пожалуйста, напиши мне где ты находишься, мне хватит города и страны`;
    const response = await this.deps.messageService.sendMessage(
      chatId,
      messageText
    );
    logger.debug({ response: response?.text }, "Start command response sent");

    await this.deps.chatMessageService.createMessage({
      userId: user.id,
      telegramChatId: chatId.toString(),
      role: MessageRole.system,
      text: response?.text || "",
      focusId: focus.id,
    });
  }
}
