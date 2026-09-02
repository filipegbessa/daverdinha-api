import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBotSettingsDto } from './dto/update-bot-settings.dto';

@Injectable()
export class BotSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.botSettings.findUniqueOrThrow({ where: { id: 1 } });
  }

  async update(dto: UpdateBotSettingsDto) {
    if (dto.botEnabled === true) {
      const activeCount = await this.prisma.menuItem.count({ where: { active: true } });
      if (activeCount === 0) {
        throw new BadRequestException('Não é possível ligar o bot sem nenhum item de menu ativo.');
      }
    }
    return this.prisma.botSettings.update({ where: { id: 1 }, data: dto });
  }

  async autoDisableIfNoActiveMenuItems() {
    const activeCount = await this.prisma.menuItem.count({ where: { active: true } });
    if (activeCount === 0) {
      await this.prisma.botSettings.update({ where: { id: 1 }, data: { botEnabled: false } });
    }
  }
}
