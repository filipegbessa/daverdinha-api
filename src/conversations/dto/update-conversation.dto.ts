import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { trim } from '../../common/transforms';

export class UpdateConversationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name: string;
}
