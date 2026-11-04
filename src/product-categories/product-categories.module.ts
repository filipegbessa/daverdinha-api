import { Module } from '@nestjs/common';
import { ProductCategoriesService } from './product-categories.service';
import { ProductCategoriesController } from './product-categories.controller';
import { PublicProductCategoriesController } from './public-product-categories.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';

@Module({
  imports: [ClerkAuthModule],
  providers: [ProductCategoriesService],
  // O público vem primeiro pra `GET /product-categories/active` casar antes
  // das rotas protegidas do admin.
  controllers: [PublicProductCategoriesController, ProductCategoriesController],
  exports: [ProductCategoriesService],
})
export class ProductCategoriesModule {}
