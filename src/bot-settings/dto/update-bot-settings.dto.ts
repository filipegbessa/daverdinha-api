import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { trim } from '../../common/transforms';

/** As mensagens são opcionais no PATCH, mas quando vêm não podem ser vazias. */
export class UpdateBotSettingsDto {
  @IsBoolean()
  @IsOptional()
  botEnabled?: boolean;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  welcomeMessage?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  invalidAttemptsExceededMessage?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  mediaReceivedMessage?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  orderReceivedMessage?: string;
}
