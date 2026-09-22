import { IsOptional, IsString } from 'class-validator';

export class ReplyDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  replyToMessageId?: string;
}
