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
    return this.prisma.menuItem.findMany({
      orderBy: { order: 'asc' },
      include: { answerOptions: { orderBy: { order: 'asc' } } },
    });
  }

  findOne(id: string) {
    return this.prisma.menuItem.findUnique({
      where: { id },
      include: { answerOptions: { orderBy: { order: 'asc' } } },
    });
  }

  create(dto: CreateMenuItemDto) {
    const { answerOptions, ...rest } = dto;
    return this.prisma.menuItem.create({
      data: {
        ...rest,
        ...(answerOptions
          ? {
              answerOptions: {
                create: answerOptions.map((option, index) => ({
                  ...option,
                  order: index,
                })),
              },
            }
          : {}),
      },
      include: { answerOptions: true },
    });
  }

  async update(id: string, dto: UpdateMenuItemDto) {
    const { answerOptions, ...rest } = dto;
    const result = await this.prisma.menuItem.update({
      where: { id },
      data: {
        ...rest,
        ...(answerOptions !== undefined
          ? {
              answerOptions: {
                deleteMany: {},
                create: answerOptions.map((option, index) => ({
                  ...option,
                  order: index,
                })),
              },
            }
          : {}),
      },
      include: { answerOptions: true },
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
      this.prisma.menuItem.update({ where: { id }, data: { order: index } }),
    );
    return this.prisma.$transaction(ops);
  }
}
