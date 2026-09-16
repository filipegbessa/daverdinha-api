import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// WhatsApp's interactive list message rejects the whole request
// (error #131009) if any row title is longer than this — capping it here
// keeps a too-long menu item topic from breaking every single menu send.
const MENU_ITEM_TOPIC_MAX_LENGTH = 24;

export class CreateMenuItemDto {
  @IsInt()
  order: number;

  @IsString()
  @MaxLength(MENU_ITEM_TOPIC_MAX_LENGTH)
  topic: string;

  /** The answer sent for an ordinary item. The system item uses the delivery* fields instead. */
  @IsString()
  @IsOptional()
  reply?: string;

  @IsString()
  @IsOptional()
  deliveryPrompt?: string;

  @IsString()
  @IsOptional()
  deliveryRetryMessage?: string;

  @IsString()
  @IsOptional()
  deliveryConfirmedMessage?: string;

  @IsString()
  @IsOptional()
  deliveryNotCoveredMessage?: string;

  @IsString()
  @IsOptional()
  deliveryUnrecognizedMessage?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
