import { Module } from '@nestjs/common';
import { PagarmeService } from './pagarme.service';
import { PAYMENT_GATEWAY } from './payment-gateway';

/** Expõe o Pagar.me só pela interface `PaymentGateway` (token `PAYMENT_GATEWAY`). */
@Module({
  providers: [
    PagarmeService,
    { provide: PAYMENT_GATEWAY, useExisting: PagarmeService },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PagarmeModule {}
