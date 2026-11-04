import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PublicProductsController } from './public-products.controller';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { BlobStorageModule } from '../media/blob-storage.module';

@Module({
  imports: [ClerkAuthModule, BlobStorageModule],
  providers: [ProductsService],
  // O público vem primeiro, e aqui é obrigatório: senão o `GET /products/:id`
  // do admin captura `GET /products/active` e responde 401.
  controllers: [PublicProductsController, ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
