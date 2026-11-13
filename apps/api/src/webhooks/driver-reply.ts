import { DRIVER_REPLIES } from '@csl/shared-types';

import type { DriverReplyOption } from '@csl/shared-types';

export function parseDriverReply(text: string): DriverReplyOption | null {
  const option = text.trim();

  return Object.hasOwn(DRIVER_REPLIES, option) ? (option as DriverReplyOption) : null;
}
