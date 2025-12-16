import { PrismaClient, User } from "@/prisma/generated/client";

export class UserService {
  constructor(private prisma: PrismaClient) {}

  // Get user by internal UUID
  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    return user;
  }

  // Get user by Telegram chatId
  async findByChatId(chatId: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { chatId },
    });
  }

  // Get user by username
  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  // Create new user
  async createUser(params: {
    username: string;
    chatId: number;
    fullName: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        chatId: params.chatId,
        username: params.username,
        fullName: params.fullName,
      },
    });
  }

  /**
   * Ensure that the user exists.
   * If user does not exist — create.
   * If exists — optionally update username.
   */
  async ensureUser(params: {
    chatId: number;
    username: string;
    fullName: string | null;
  }): Promise<User> {
    const { chatId, username, fullName } = params;

    const existing = await this.findByChatId(chatId);

    if (!existing) {
      return this.prisma.user.create({
        data: {
          chatId,
          username: username ?? `user_${chatId}`,
          fullName,
        },
      });
    }

    // Sync username if it has changed
    if (username && username !== existing.username) {
      return this.prisma.user.update({
        data: { username },
        where: { id: existing.id },
      });
    }

    return existing;
  }

  // Update user (partial update)
  async updateUser(
    id: string,
    data: Partial<Pick<User, "chatId" | "username" | "fullName" | "timezone">>
  ): Promise<User> {
    return this.prisma.user.update({
      data,
      where: { id },
    });
  }

  // Delete user
  async deleteUser(id: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    });
  }

  async getAllUsers(): Promise<User[]> {
    return this.prisma.user.findMany();
  }

  async setFocus(id: string, focusId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { focusId },
    });
  }
}
