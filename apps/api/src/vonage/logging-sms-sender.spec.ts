import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoggingSmsSender } from './logging-sms-sender.js';

describe('LoggingSmsSender', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the SMS with a masked number and returns a recognisable id', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const { messageId } = await new LoggingSmsSender().sendSms('+34600123456', 'CSL: hola');

    expect(messageId).toMatch(/^unsent-[0-9a-f-]{36}$/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('+********456'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('CSL: hola'));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('600123456'));
  });
});
