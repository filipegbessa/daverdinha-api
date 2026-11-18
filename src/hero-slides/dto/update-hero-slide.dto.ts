import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { toBoolean } from '../../common/transforms';
import { CreateHeroSlideDto } from './create-hero-slide.dto';

export class UpdateHeroSlideDto extends PartialType(CreateHeroSlideDto) {
  /** `true` apaga a imagem atual sem mandar outra (o slide fica com o fundo da marca). */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  removeImage?: boolean;
}
