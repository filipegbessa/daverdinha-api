import { Module } from '@nestjs/common';
import { CepLookupService } from './cep-lookup.service';

@Module({
  providers: [CepLookupService],
  exports: [CepLookupService],
})
export class CepLookupModule {}
