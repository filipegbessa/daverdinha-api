import { PartialType } from '@nestjs/mapped-types';
import { CreateDeliveryLocationDto } from './create-delivery-location.dto';

export class UpdateDeliveryLocationDto extends PartialType(CreateDeliveryLocationDto) {}
