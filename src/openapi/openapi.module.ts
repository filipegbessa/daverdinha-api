import { Module } from '@nestjs/common';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { OpenApiController } from './openapi.controller';
import { OpenApiService } from './openapi.service';

@Module({
  imports: [ClerkAuthModule],
  providers: [OpenApiService],
  controllers: [OpenApiController],
})
export class OpenApiModule {}
