import { Context } from "telegraf";
import { UserService } from "@/services/user.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { MessageService } from "@/services/message.service";
import { generateObjectsTable } from "@/utils/generateTable";
import { env } from "@/config/env";
import { AiRequestService } from "@/services/aiRequest.service";
import { SettingService } from "@/services/setting.service";
import { readFileSync } from "fs";
import { join } from "path";

export interface AdminHandlerDependencies {
  userService: UserService;
  chatMessageService: ChatMessageService;
  aiRequestService: AiRequestService;
  settingService: SettingService;
  messageService: MessageService;
}

export class AdminHandler {
  constructor(private deps: AdminHandlerDependencies) {}

  private async isAdmin(ctx: Context): Promise<boolean> {
    const chatId = ctx.message?.chat.id;
    if (!chatId) return false;

    const user = await this.deps.userService.findByChatId(chatId);
    return user?.username === env.ADMIN_USERNAME;
  }

  async handleUsers(ctx: Context) {
    if (!(await this.isAdmin(ctx))) return;

    const users = await this.deps.userService.getAllUsers();
    const chatId = ctx.message?.chat.id;
    if (!chatId) return;

    const usersData = generateObjectsTable(
      users.map((user) => ({
        username: user.username,
        chatId: user.chatId,
      }))
    );
    await this.deps.messageService.sendMarkdownV2(
      chatId,
      "```\n" + usersData + "\n```"
    );
  }

  async handleMessages(ctx: Context) {
    if (!(await this.isAdmin(ctx))) return;

    const chatId = ctx.message?.chat.id;
    if (!chatId) return;

    const user = await this.deps.userService.findByChatId(chatId);
    if (!user) return;

    const messages = await this.deps.chatMessageService.getMessagesByUserId(
      user.id
    );
    const messagesData = generateObjectsTable(
      messages.map((message) => ({
        role: message.role,
        text: message.text,
        createdAt: message.createdAt.toISOString(),
        focusId: message.focusId,
        telegramChatId: message.telegramChatId,
        telegramReplyToId: message.telegramReplyToId,
      }))
    );
    await this.deps.messageService.sendMarkdownV2(
      chatId,
      "```\n" + messagesData + "\n```"
    );
  }

  async handleAiRequests(ctx: Context) {
    if (!(await this.isAdmin(ctx))) return;

    const chatId = ctx.message?.chat.id;
    if (!chatId) return;

    const user = await this.deps.userService.findByChatId(chatId);
    if (!user) return;

    const requests = await this.deps.aiRequestService.getAiRequests();
    const requestsData = generateObjectsTable(
      requests.map((request) => ({
        // userId: request.userId,
        status: request.status,
        elapsedTime: request.elapsedTime,
        inputTokens: request.inputTokens,
        outputTokens: request.outputTokens,
        totalTokens: request.totalTokens,
        cost: request.cost,
      }))
    );
    await this.deps.messageService.sendMarkdownV2(
      chatId,
      "```\n" + requestsData + "\n```"
    );
  }

  async handleHealth(ctx: Context) {
    if (!(await this.isAdmin(ctx))) return;

    const chatId = ctx.message?.chat.id;
    if (!chatId) return;

    await this.deps.messageService.sendMessage(chatId, "OK");
  }

  async handleVersion(ctx: Context) {
    if (!(await this.isAdmin(ctx))) return;

    const chatId = ctx.message?.chat.id;
    if (!chatId) return;

    try {
      const packageJsonPath = join(process.cwd(), "package.json");
      const packageJson = JSON.parse(
        readFileSync(packageJsonPath, "utf-8")
      ) as { version: string };
      await this.deps.messageService.sendMessage(
        chatId,
        `Version: ${packageJson.version}`
      );
    } catch (error) {
      await this.deps.messageService.sendMessage(
        chatId,
        "Failed to read version"
      );
    }
  }

  async handleSettings(ctx: Context) {
    if (!(await this.isAdmin(ctx))) return;

    const messageText =
      ctx.message && "text" in ctx.message ? ctx.message.text : "";
    if (!messageText) return;

    const chatId = ctx.message?.chat.id;
    if (!chatId) return;

    // Parse command: /settings -set key:value or /settings -get key
    const parts = messageText.trim().split(/\s+/);
    if (parts.length < 3) {
      await this.deps.messageService.sendMessage(
        chatId,
        "Usage:\n/settings -set key:value\n/settings -get key"
      );
      return;
    }

    const action = parts[1];
    const arg = parts[2];

    if (action === "-set") {
      // Parse key:value
      const colonIndex = arg.indexOf(":");
      if (colonIndex === -1) {
        await this.deps.messageService.sendMessage(
          chatId,
          "Invalid format. Use: key:value"
        );
        return;
      }

      const key = arg.substring(0, colonIndex);
      const value = arg.substring(colonIndex + 1);

      if (!key || !value) {
        await this.deps.messageService.sendMessage(
          chatId,
          "Key and value cannot be empty"
        );
        return;
      }

      await this.deps.settingService.setValue(key, value);
      await this.deps.messageService.sendMessage(
        chatId,
        `Setting "${key}" set to "${value}"`
      );
    } else if (action === "-get") {
      const key = arg;
      if (!key) {
        await this.deps.messageService.sendMessage(
          chatId,
          "Key cannot be empty"
        );
        return;
      }

      const value = await this.deps.settingService.getValue(key);
      if (value === null) {
        await this.deps.messageService.sendMessage(
          chatId,
          `Setting "${key}" not found`
        );
      } else {
        await this.deps.messageService.sendMessage(
          chatId,
          `Setting "${key}" = "${value}"`
        );
      }
    } else {
      await this.deps.messageService.sendMessage(
        chatId,
        "Invalid action. Use -set or -get"
      );
    }
  }
}
