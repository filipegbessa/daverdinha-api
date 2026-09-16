import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaginationQueryDto,
  pageBounds,
  paginated,
} from '../common/pagination';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ordered by name, which — unlike the conversation list — never changes on
   * its own, so page boundaries stay put while the operator browses.
   */
  async list(query: PaginationQueryDto = {}) {
    const { page, perPage, skip, take } = pageBounds(query);

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: { name: 'asc' },
        skip,
        take,
        include: { _count: { select: { conversations: true } } },
      }),
      this.prisma.category.count(),
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
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.mapDuplicateNameError(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  private mapDuplicateNameError(error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      return new ConflictException('Já existe uma categoria com esse nome.');
    }
    return error;
  }
}
