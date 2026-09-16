import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Max, Min } from 'class-validator';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class ListMessagesDto {
  /**
   * Poll mode: everything from this instant onwards. Inclusive on purpose —
   * timestamps have millisecond resolution and the bot can write two messages
   * inside the same one (a welcome and a menu, back to back). Re-sending the
   * boundary message and letting the client drop it by id is correct; a strict
   * `>` would silently lose its twin.
   */
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  since?: Date;

  /** History mode: the page of messages immediately older than this instant. */
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  before?: Date;

  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  @IsOptional()
  @Type(() => Number)
  limit?: number = DEFAULT_LIMIT;
}

export { DEFAULT_LIMIT as DEFAULT_MESSAGES_LIMIT };
