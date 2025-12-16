import {
  PrismaClient,
  ChatMessage,
  MessageRole,
} from "@/prisma/generated/client";

export class ChatMessageService {
  constructor(private prisma: PrismaClient) {}

  // Create a new chat message
  async createMessage(params: {
    userId: string;
    telegramChatId: string;
    telegramMessageId?: string | null;
    telegramReplyToId?: string | null;
    role: MessageRole;
    text: string;
    aiAction?: any;
    scheduleId?: string | null;
    focusId?: string | null;
  }): Promise<ChatMessage> {
    return this.prisma.chatMessage.create({
      data: {
        userId: params.userId,
        telegramChatId: params.telegramChatId,
        telegramMessageId: params.telegramMessageId ?? null,
        telegramReplyToId: params.telegramReplyToId ?? null,
        role: params.role,
        text: params.text,
        aiAction: params.aiAction ?? null,
        scheduleId: params.scheduleId ?? null,
        focusId: params.focusId ?? null,
      },
    });
  }

  // Set focus for a chat message
  async setFocus(messageId: string, focusId: string): Promise<ChatMessage> {
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { focusId },
    });
  }

  // Get messages by focusId
  async getMessagesByFocusId(focusId: string): Promise<ChatMessage[]> {
    return this.prisma.chatMessage.findMany({
      where: { focusId },
      orderBy: { createdAt: "asc" },
    });
  }

  // Get message by ID
  async findById(id: string): Promise<ChatMessage | null> {
    return this.prisma.chatMessage.findUnique({
      where: { id },
    });
  }

  // Get messages by user ID
  async getMessagesByUserId(userId: string): Promise<ChatMessage[]> {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }
}
