import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateBotSettingsDto {
  @IsBoolean()
  @IsOptional()
  botEnabled?: boolean;

  @IsString()
  @IsOptional()
  welcomeMessage?: string;

  @IsString()
  @IsOptional()
  invalidAttemptsExceededMessage?: string;

  @IsString()
  @IsOptional()
  mediaReceivedMessage?: string;

  @IsString()
  @IsOptional()
  orderReceivedMessage?: string;
}
