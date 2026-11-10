import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class ReorderMenuItemsDto {
  /** Todos os itens, na ordem nova. O teto é folgado: o menu tem poucos itens. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  orderedIds: string[];
}
