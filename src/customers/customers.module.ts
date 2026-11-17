import { Module } from '@nestjs/common';
import { ClerkAuthModule } from '../common/auth/clerk-auth.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [ClerkAuthModule],
  providers: [CustomersService],
  controllers: [CustomersController],
})
export class CustomersModule {}
