import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDeliveryAreaDto } from './create-delivery-area.dto';

/** A zona não muda: os bairros da área são todos dela. */
export class UpdateDeliveryAreaDto extends PartialType(
  OmitType(CreateDeliveryAreaDto, ['zone'] as const),
) {}
