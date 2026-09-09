import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

@Injectable()
export class DeliveryLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.deliveryLocation.findMany({
      orderBy: [{ zone: 'asc' }, { regionName: 'asc' }],
      include: { cepRanges: true },
    });
  }

  update(id: string, dto: UpdateDeliveryLocationDto) {
    return this.prisma.deliveryLocation.update({ where: { id }, data: dto });
  }
}
