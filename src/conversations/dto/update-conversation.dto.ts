import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { emptyToNull } from '../../common/transforms';

export class UpdateConversationDto {
  /**
   * Nome do contato no admin. Vazio (ou só espaço) apaga o nome (`null`), e a
   * conversa volta a aparecer pelo telefone; com nome, ele é o principal e o
   * telefone vira secundário.
   */
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  name: string | null;
}
