import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { CATEGORY_COLORS } from '../category-colors';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(CATEGORY_COLORS)
  color: string;
}
