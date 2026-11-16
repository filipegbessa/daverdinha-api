import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CustomerDto } from './customer.dto';
import { LookupOrdersDto } from './lookup-orders.dto';

const errorsOf = (dto: object) =>
  validateSync(dto).map((error) => error.property);

describe('limites do Pagar.me no comprador', () => {
  const valid = {
    name: 'Maria Silva',
    email: 'maria@exemplo.com',
    phone: '21999998888',
    document: '11144477735',
  };
  const emailOf = (length: number) =>
    `${'a'.repeat(length - '@exemplo.com'.length)}@exemplo.com`;

  it('aceita nome e e-mail com até 64 caracteres', () => {
    const dto = plainToInstance(CustomerDto, {
      ...valid,
      name: 'M'.repeat(64),
      email: emailOf(64),
    });
    expect(errorsOf(dto)).toEqual([]);
  });

  it('recusa nome ou e-mail com 65', () => {
    const dto = plainToInstance(CustomerDto, {
      ...valid,
      name: 'M'.repeat(65),
      email: emailOf(65),
    });
    expect(errorsOf(dto)).toEqual(['name', 'email']);
  });

  it('recusa documento vazio ou curto demais', () => {
    expect(
      errorsOf(plainToInstance(CustomerDto, { ...valid, document: '' })),
    ).toEqual(['document']);
    expect(
      errorsOf(plainToInstance(CustomerDto, { ...valid, document: 'AB1' })),
    ).toEqual(['document']);
  });

  it('usa o mesmo limite no "Meus pedidos"', () => {
    expect(
      errorsOf(plainToInstance(LookupOrdersDto, { email: emailOf(65) })),
    ).toEqual(['email']);
  });
});
