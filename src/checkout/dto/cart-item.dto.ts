import { IsInt, IsUUID, Max, Min } from 'class-validator';

/** Só o que o carrinho sabe: qual produto e quantos. Preço vem do banco. */
export class CartItemDto {
  @IsUUID('all')
  productId: string;

  @IsInt()
  @Min(1)
  @Max(20)
  quantity: number;
}
