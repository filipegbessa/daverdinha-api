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
  deliveryPrompt?: string;

  @IsString()
  @IsOptional()
  deliveryWaitMessage?: string;
}
