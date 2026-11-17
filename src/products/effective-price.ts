import { Prisma } from '@prisma/client';

export interface PromoFields {
  price: Prisma.Decimal | number | string;
  promoPrice: Prisma.Decimal | number | string | null;
  promoStartsAt: Date | null;
  promoEndsAt: Date | null;
}

/**
 * O preço que vale agora. A promoção conta quando existe, é menor que o
 * preço cheio e o momento está dentro da janela (sem início = já começou;
 * sem fim = não acaba). `listPrice` é o preço cheio, só com promoção valendo:
 * é o "de" riscado do site.
 */
export function effectivePrice(
  product: PromoFields,
  now: Date = new Date(),
): { price: Prisma.Decimal; listPrice: Prisma.Decimal | null } {
  const price = new Prisma.Decimal(product.price);
  if (product.promoPrice === null || product.promoPrice === undefined) {
    return { price, listPrice: null };
  }
  const promo = new Prisma.Decimal(product.promoPrice);
  const started = !product.promoStartsAt || product.promoStartsAt <= now;
  const notEnded = !product.promoEndsAt || now < product.promoEndsAt;
  if (promo.lessThan(price) && started && notEnded) {
    return { price: promo, listPrice: price };
  }
  return { price, listPrice: null };
}
