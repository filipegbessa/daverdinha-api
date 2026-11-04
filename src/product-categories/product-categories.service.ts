import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { uniqueSlug } from '../common/slug';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../common/prisma-errors';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';

/** O que o site recebe — nada de `active`, `order` ou datas. */
export interface ProductCategoryPublic {
  id: string;
  name: string;
  slug: string;
  description: string;
}

const ORDER = [{ order: 'asc' as const }, { name: 'asc' as const }];

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sem paginação: são poucas categorias, e o admin precisa de todas pra escolher no produto. */
  list() {
    return this.prisma.productCategory.findMany({
      orderBy: ORDER,
      include: { _count: { select: { products: true } } },
    });
  }

  async create(dto: CreateProductCategoryDto) {
    try {
      return await this.createWithFreshSlug(dto);
    } catch (error) {
      // Outra criação simultânea pegou o mesmo slug entre a checagem e o
      // insert: uma nova tentativa já enxerga o slug ocupado e pula pro próximo.
      if (isUniqueViolation(error, 'slug')) {
        return this.createWithFreshSlug(dto).catch((e: unknown) => {
          throw this.mapDuplicateName(e);
        });
      }
      throw this.mapDuplicateName(error);
    }
  }

  /** Nunca recalcula o slug: renomear a categoria não pode mudar a URL dela. */
  async update(id: string, dto: UpdateProductCategoryDto) {
    try {
      return await this.prisma.productCategory.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      throw this.mapDuplicateName(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.productCategory.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Não é possível excluir uma categoria com produtos cadastrados.',
        );
      }
      throw error;
    }
  }

  /**
   * Só categoria ativa **com** produto ativo: uma categoria vazia viraria uma
   * página sem conteúdo no site.
   */
  listActive(): Promise<ProductCategoryPublic[]> {
    return this.prisma.productCategory.findMany({
      where: { active: true, products: { some: { active: true } } },
      orderBy: ORDER,
      select: { id: true, name: true, slug: true, description: true },
    });
  }

  private async createWithFreshSlug(dto: CreateProductCategoryDto) {
    const slug = await uniqueSlug(dto.name, async (candidate) =>
      Boolean(
        await this.prisma.productCategory.findUnique({
          where: { slug: candidate },
        }),
      ),
    );
    return this.prisma.productCategory.create({ data: { ...dto, slug } });
  }

  private mapDuplicateName(error: unknown) {
    if (isUniqueViolation(error, 'name')) {
      return new ConflictException('Já existe uma categoria com esse nome.');
    }
    return error;
  }
}
