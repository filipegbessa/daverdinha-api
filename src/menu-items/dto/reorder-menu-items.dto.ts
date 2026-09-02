import { IsArray, IsString } from 'class-validator';

export class ReorderMenuItemsDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds: string[];
}
