import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { conversations: true } } },
    });
    return categories.map(({ _count, ...category }) => ({
      ...category,
      conversationCount: _count.conversations,
    }));
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
