// Feature: installation-pm — Spike 0.3 (D-6a): in-memory adapter สำหรับเทสต์ logic คิวล้วน
import type { QueueItem, QueueStorage } from './types';

export class MemoryQueueStorage implements QueueStorage {
  private items = new Map<string, QueueItem>();

  async put(item: QueueItem): Promise<void> {
    this.items.set(item.submissionId, { ...item });
  }

  async get(submissionId: string): Promise<QueueItem | undefined> {
    const found = this.items.get(submissionId);
    return found ? { ...found } : undefined;
  }

  async list(): Promise<QueueItem[]> {
    return [...this.items.values()]
      .map((i) => ({ ...i }))
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }

  async delete(submissionId: string): Promise<void> {
    this.items.delete(submissionId);
  }
}
