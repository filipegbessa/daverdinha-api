import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isRecordNotFound } from '../common/prisma-errors';
import { BotSettingsService } from '../bot-settings/bot-settings.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { ReorderMenuItemsDto } from './dto/reorder-menu-items.dto';

const NOT_FOUND = 'Item de menu não encontrado.';

@Injectable()
export class MenuItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botSettings: BotSettingsService,
  ) {}

  /**
   * Sem paginação de propósito: são poucos itens (a lista interativa do
   * WhatsApp mostra no máximo 10), e o admin reordena todos juntos.
   */
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
    return this.findRow(id);
  }

  create(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({ data: dto });
  }

  /** Sem `findRow` antes: o P2025 do próprio `update` vira o 404, numa consulta só. */
  async update(id: string, dto: UpdateMenuItemDto) {
    const result = await this.prisma.menuItem
      .update({ where: { id }, data: dto })
      .catch((error: unknown) => {
        throw isRecordNotFound(error)
          ? new NotFoundException(NOT_FOUND)
          : error;
      });
    if (dto.active === false) {
      await this.botSettings.autoDisableIfNoActiveMenuItems();
    }
    return result;
  }

  async remove(id: string) {
    const item = await this.findRow(id);
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

  async reorder(dto: ReorderMenuItemsDto) {
    const ops = dto.orderedIds.map((id, index) =>
      this.prisma.menuItem.update({ where: { id }, data: { order: index } }),
    );
    try {
      return await this.prisma.$transaction(ops);
    } catch (error) {
      // Um id que não existe desfaz a transação inteira: nenhuma ordem muda.
      if (isRecordNotFound(error)) throw new NotFoundException(NOT_FOUND);
      throw error;
    }
  }

  private async findRow(id: string) {
    const row = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }
}
