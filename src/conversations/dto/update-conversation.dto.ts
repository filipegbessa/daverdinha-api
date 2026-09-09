import { IsString } from 'class-validator';

export class UpdateConversationDto {
  @IsString()
  name: string;
}
