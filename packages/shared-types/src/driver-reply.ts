export const DRIVER_REPLIES = {
  '1': 'resolve_with_store',
  '2': 'request_mediation',
} as const;

export type DriverReplyOption = keyof typeof DRIVER_REPLIES;

export type DriverReply = (typeof DRIVER_REPLIES)[DriverReplyOption];
