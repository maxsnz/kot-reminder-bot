import { PrismaClient, Setting } from "@/prisma/generated/client";

export class SettingService {
  constructor(private prisma: PrismaClient) {}

  // Get setting value by key
  async getValue(key: string): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({
      where: { key },
    });
    return setting?.value ?? null;
  }

  // Set setting value (create if not exists, update if exists)
  async setValue(key: string, value: string): Promise<Setting> {
    return this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
