import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class SetAreaLocationsDto {
  /** A lista inteira de bairros da área; quem ficar de fora sai dela. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  locationIds: string[];
}
