import { Module } from '@nestjs/common';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [ClerkAuthModule],
  providers: [CouponsService],
  controllers: [CouponsController],
  exports: [CouponsService],
})
export class CouponsModule {}
