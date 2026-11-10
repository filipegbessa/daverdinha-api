import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../common/prisma-errors';
import { Prisma } from '@prisma/client';
import { pageBounds, paginated } from '../common/pagination';
import { ListCategoriesDto } from './dto/list-categories.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ordenada por nome, que (ao contrário da lista de conversas) não muda
   * sozinho, então as páginas ficam paradas enquanto a operadora navega.
   * `?q=` filtra no banco, pra achar marcador que está em outra página.
   */
  async list(query: ListCategoriesDto = {}) {
    const { page, perPage, skip, take } = pageBounds(query);
    const where: Prisma.CategoryWhereInput = query.q
      ? { name: { contains: query.q, mode: 'insensitive' } }
      : {};

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
        include: { _count: { select: { conversations: true } } },
      }),
      this.prisma.category.count({ where }),
    ]);

    const items = categories.map(({ _count, ...category }) => ({
      ...category,
      conversationCount: _count.conversations,
    }));

    return paginated(items, total, page, perPage);
  }

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({ data: dto });
    } catch (error) {
      throw this.mapDuplicateNameError(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findRow(id);
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapDuplicateNameError(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findRow(id);
    await this.prisma.category.delete({ where: { id } });
  }

  private async findRow(id: string) {
    const row = await this.prisma.category.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Marcador não encontrado.');
    return row;
  }

  // `name` é a única chave única além do id, então qualquer P2002 é nome repetido.
  private mapDuplicateNameError(error: unknown) {
    if (isUniqueViolation(error)) {
      return new ConflictException('Já existe um marcador com esse nome.');
    }
    return error;
  }
}
