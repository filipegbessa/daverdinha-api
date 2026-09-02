import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryLocationDto } from './dto/create-delivery-location.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

@Injectable()
export class DeliveryLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.deliveryLocation.findMany({
      orderBy: [{ zone: 'asc' }, { regionName: 'asc' }],
    });
  }

  create(dto: CreateDeliveryLocationDto) {
    return this.prisma.deliveryLocation.create({ data: dto });
  }

  update(id: string, dto: UpdateDeliveryLocationDto) {
    return this.prisma.deliveryLocation.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.deliveryLocation
      .delete({ where: { id } })
      .then(() => undefined);
  }
}
