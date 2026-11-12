import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { toBoolean } from '../../common/transforms';
import { CreateEventDto } from './create-event.dto';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  /** `true` apaga a foto atual sem mandar outra (o site volta pro placeholder). */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  removeImage?: boolean;
}
