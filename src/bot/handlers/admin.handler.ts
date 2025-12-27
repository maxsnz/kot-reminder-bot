import { Context } from "telegraf";
import { performance } from "perf_hooks";
import { UserService } from "@/services/user.service";
import { ChatMessageService } from "@/services/chatMessage.service";
import { MessageService } from "@/services/message.service";
import { generateObjectsTable } from "@/utils/generateTable";
import { env } from "@/config/env";
import { AiRequestService } from "@/services/aiRequest.service";
import { SettingService } from "@/services/setting.service";
import { ScheduleService } from "@/services/schedule.service";
import { logger } from "@/utils/logger";
import { readFileSync } from "fs";
import { join } from "path";

export interface AdminHandlerDependencies {
  userService: UserService;
  chatMessageService: ChatMessageService;
  aiRequestService: AiRequestService;
  settingService: SettingService;
  messageService: MessageService;
  scheduleService: ScheduleService;
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
    const requestsData = requests
      .map(
        (request) =>
          `[${request.createdAt
            .toISOString()
            .replace("T", " ")
            .substring(0, 16)}] @${request.user.username} | ${
            request.status
          } | ${
            request.elapsedTime
              ? Math.round((request.elapsedTime / 1000) * 10) / 10
              : null
          }ms | ${request.totalTokens} tokens`
      )
      .join("\n\n");
    await this.deps.messageService.sendAsCodeBlock(
      chatId,
      `[requests]\n${requestsData}`
    );
  }

  async handleHealth(ctx: Context) {
    if (!(await this.isAdmin(ctx))) return;

    const chatId = ctx.message?.chat.id;
    if (!chatId) return;

    const last = (performance as any).eventLoopUtilization();

    setTimeout(() => {
      try {
        const current = (performance as any).eventLoopUtilization(last);

        void this.deps.messageService.sendJson(chatId, {
          ok: true,
          ts: new Date().toISOString(),
          utilization: Number(current.utilization.toFixed(3)),
          activeMs: Number((current.active / 1e6).toFixed(3)),
          idleMs: Number((current.idle / 1e6).toFixed(3)),
        });
      } catch (e) {
        logger.error({ err: e }, "ELU measure failed");
      }
    }, 10_000);
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

  async handleRemoveAllMyTasks(ctx: Context) {
    if (!(await this.isAdmin(ctx))) return;

    const chatId = ctx.message?.chat.id;
    if (!chatId) return;

    const user = await this.deps.userService.findByChatId(chatId);
    if (!user) {
      await this.deps.messageService.sendMessage(chatId, "User not found");
      return;
    }

    try {
      const deletedCount =
        await this.deps.scheduleService.deleteAllSchedulesByUserId(user.id);

      await this.deps.messageService.sendMessage(
        chatId,
        `Deleted ${deletedCount} task${deletedCount !== 1 ? "s" : ""}`
      );
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error : new Error(String(error)),
          userId: user.id,
        },
        "Failed to delete all tasks for user"
      );
      await this.deps.messageService.sendMessage(
        chatId,
        "Failed to delete tasks. Please try again later."
      );
    }
  }
}
