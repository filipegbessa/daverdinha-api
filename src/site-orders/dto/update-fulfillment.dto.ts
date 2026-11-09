import { IsIn } from 'class-validator';

export const FULFILLMENT_STATUSES = [
  'awaiting',
  'preparing',
  'ready',
  'completed',
] as const;

export class UpdateFulfillmentDto {
  @IsIn(FULFILLMENT_STATUSES)
  fulfillmentStatus: (typeof FULFILLMENT_STATUSES)[number];
}
