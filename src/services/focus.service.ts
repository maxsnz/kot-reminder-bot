import {
  PrismaClient,
  Focus,
  Prisma,
  Schedule,
} from "@/prisma/generated/client";

export class FocusService {
  constructor(private prisma: PrismaClient) {}

  // Create a new focus
  async createFocus() {
    return this.prisma.focus.create({
      data: {},
    });
  }

  // Set schedule for an existing focus
  async setSchedule(focusId: string, scheduleId: string): Promise<Focus> {
    return this.prisma.focus.update({
      where: { id: focusId },
      data: { scheduleId },
    });
  }

  // Find focus by ID
  async findById(id: string): Promise<Focus | null> {
    return this.prisma.focus.findUnique({
      where: { id },
    });
  }

  // Find focus by user ID
  async findByUserId(userId: string) {
    return this.prisma.focus.findFirst({
      where: { users: { some: { id: userId } } },
    });
  }

  async getSchedule(id: string): Promise<Schedule | null> {
    const focus = await this.prisma.focus.findUnique({
      where: { id },
      include: { schedule: true },
    });
    if (!focus) {
      throw new Error("Focus not found");
    }
    return focus?.schedule ?? null;
  }

  // Find focus by scheduleId
  async findByScheduleId(scheduleId: string): Promise<Focus | null> {
    return this.prisma.focus.findFirst({
      where: { scheduleId },
    });
  }
}
