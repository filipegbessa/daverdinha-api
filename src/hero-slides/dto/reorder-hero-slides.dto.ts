import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class ReorderHeroSlidesDto {
  /** Todos os slides, na ordem nova. O teto é folgado: são poucos slides. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  orderedIds: string[];
}
