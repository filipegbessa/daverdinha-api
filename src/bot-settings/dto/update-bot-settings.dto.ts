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
  menuPrompt?: string;

  @IsString()
  @IsOptional()
  deliveryPrompt?: string;

  @IsString()
  @IsOptional()
  deliveryWaitMessage?: string;

  @IsString()
  @IsOptional()
  deliveryNotCoveredMessage?: string;

  @IsString()
  @IsOptional()
  deliveryUnrecognizedMessage?: string;

  @IsString()
  @IsOptional()
  invalidAttemptsExceededMessage?: string;
}
