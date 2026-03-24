export type PendingCustomSnooze = {
  scheduleId: string;
  promptMessageId: number;
  chatId: number;
};

const TTL_MS = 5 * 60 * 1000; // 5 minutes

type Entry = PendingCustomSnooze & { expiresAt: number };

export class CustomSnoozeStateStore {
  private state = new Map<string, Entry>();

  set(userId: string, data: PendingCustomSnooze): void {
    this.state.set(userId, { ...data, expiresAt: Date.now() + TTL_MS });
  }

  get(userId: string): PendingCustomSnooze | undefined {
    const entry = this.state.get(userId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.state.delete(userId);
      return undefined;
    }
    return entry;
  }

  delete(userId: string): void {
    this.state.delete(userId);
  }

  has(userId: string): boolean {
    return this.get(userId) !== undefined;
  }
}
