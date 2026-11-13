export const DRIVER_REPLIES = {
  '1': 'delivered',
  '2': 'address_not_found',
  '3': 'customer_not_home',
} as const;

export type DriverReplyOption = keyof typeof DRIVER_REPLIES;

export type DriverReply = (typeof DRIVER_REPLIES)[DriverReplyOption];
