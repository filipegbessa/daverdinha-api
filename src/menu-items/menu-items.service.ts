import { ForbiddenException, Injectable } from '@nestjs/common';
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
    return this.prisma.menuItem.findMany({ orderBy: { order: 'asc' } });
  }

  /** What the customer actually sees, in menu order. */
  listActive() {
    return this.prisma.menuItem.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    });
  }

  findOne(id: string) {
    return this.prisma.menuItem.findUnique({ where: { id } });
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
    const item = await this.prisma.menuItem.findUniqueOrThrow({
      where: { id },
    });
    if (item.isSystem) {
      throw new ForbiddenException(
        'Não é possível excluir um item de sistema.',
      );
    }
    await this.prisma.menuItem.delete({ where: { id } });
    await this.botSettings.autoDisableIfNoActiveMenuItems();
  }

  /**
   * The delivery-location flow. It's the only system item there is — it
   * can't be created or deleted from the admin, only edited, because the
   * bot hard-depends on its four messages existing.
   */
  findSystemDeliveryItem() {
    return this.prisma.menuItem.findFirstOrThrow({ where: { isSystem: true } });
  }

  reorder(dto: ReorderMenuItemsDto) {
    const ops = dto.orderedIds.map((id, index) =>
      this.prisma.menuItem.update({ where: { id }, data: { order: index } }),
    );
    return this.prisma.$transaction(ops);
  }
}
