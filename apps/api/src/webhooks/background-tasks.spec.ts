import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackgroundTasks } from './background-tasks.js';

describe('BackgroundTasks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the task without blocking the caller and waits for it when asked', async () => {
    const tasks = new BackgroundTasks();
    const done: string[] = [];

    tasks.run('first', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      done.push('first');
    });

    expect(done).toEqual([]);

    await tasks.whenIdle();

    expect(done).toEqual(['first']);
  });

  it('waits for tasks started by other tasks', async () => {
    const tasks = new BackgroundTasks();
    const done: string[] = [];

    tasks.run('outer', () => {
      tasks.run('inner', () => {
        done.push('inner');
        return Promise.resolve();
      });
      return Promise.resolve();
    });

    await tasks.beforeApplicationShutdown();

    expect(done).toEqual(['inner']);
  });

  it('logs a failing task instead of throwing, including synchronous throws', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const tasks = new BackgroundTasks();

    tasks.run('async', () => Promise.reject(new Error('boom')));
    tasks.run('sync', () => {
      throw new Error('bang');
    });

    await expect(tasks.whenIdle()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('async failed: boom');
    expect(error).toHaveBeenCalledWith('sync failed: bang');
  });
});
