import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { ReorderMenuItemsDto } from './dto/reorder-menu-items.dto';

@Injectable()
export class MenuItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botSettings: BotSettingsService,
  ) {}

  list() {
    return this.prisma.menuItem.findMany({ orderBy: { ordem: 'asc' } });
  }

  create(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({ data: dto });
  }

  async update(id: string, dto: UpdateMenuItemDto) {
    const result = await this.prisma.menuItem.update({
      where: { id },
      data: dto,
    });
    if (dto.active === false) {
      await this.botSettings.autoDisableIfNoActiveMenuItems();
    }
    return result;
  }

  async remove(id: string) {
    await this.prisma.menuItem.delete({ where: { id } });
    await this.botSettings.autoDisableIfNoActiveMenuItems();
  }

  reorder(dto: ReorderMenuItemsDto) {
    const ops = dto.orderedIds.map((id, index) =>
      this.prisma.menuItem.update({ where: { id }, data: { ordem: index } }),
    );
    return this.prisma.$transaction(ops);
  }
}
