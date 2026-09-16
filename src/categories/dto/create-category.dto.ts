import { IsNotEmpty, IsString, Matches } from 'class-validator';

// The admin picks freely from a colour input, so the only thing worth
// enforcing is that what arrives is a colour at all — anything else would
// land in `style="background-color: ..."` on the chip and render as nothing.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Matches(HEX_COLOR, {
    message: 'color deve ser um hexadecimal no formato #rrggbb.',
  })
  color: string;
}
