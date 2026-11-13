import { Injectable, Logger } from '@nestjs/common';

import type { BeforeApplicationShutdown } from '@nestjs/common';

@Injectable()
export class BackgroundTasks implements BeforeApplicationShutdown {
  private readonly logger = new Logger(BackgroundTasks.name);
  private readonly pending = new Set<Promise<void>>();

  run(label: string, task: () => Promise<void>): void {
    const promise: Promise<void> = Promise.resolve()
      .then(task)
      .catch((error: unknown) => {
        this.logger.error(
          `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.pending.delete(promise);
      });

    this.pending.add(promise);
  }

  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all(this.pending);
    }
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.whenIdle();
  }
}
