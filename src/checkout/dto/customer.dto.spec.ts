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
      name: `Maria ${'S'.repeat(58)}`,
      email: emailOf(64),
    });
    expect(errorsOf(dto)).toEqual([]);
  });

  it('recusa nome ou e-mail com 65', () => {
    const dto = plainToInstance(CustomerDto, {
      ...valid,
      name: `Maria ${'S'.repeat(59)}`,
      email: emailOf(65),
    });
    expect(errorsOf(dto)).toEqual(['name', 'email']);
  });

  it('aceita sem documento: é opcional', () => {
    const { document: _document, ...rest } = valid;
    expect(errorsOf(plainToInstance(CustomerDto, rest))).toEqual([]);
  });

  it('recusa documento curto demais quando ele é informado', () => {
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

describe('nome completo', () => {
  const base = {
    email: 'maria@exemplo.com',
    phone: '21999998888',
    document: '11144477735',
  };
  const nameErrors = (name: string) =>
    errorsOf(plainToInstance(CustomerDto, { ...base, name }));

  it.each(['Maria Silva', 'Ana de Sá', 'José  da   Silva', 'Ana Maria-Souza'])(
    'aceita "%s"',
    (name) => expect(nameErrors(name)).toEqual([]),
  );

  it.each(['Maria', 'Maria .', 'M 2', '  Maria  ', '12 34'])(
    'recusa "%s"',
    (name) => expect(nameErrors(name)).toEqual(['name']),
  );

  it('junta espaços repetidos e tira as pontas', () => {
    const dto = plainToInstance(CustomerDto, {
      ...base,
      name: '  Maria   da  Silva ',
    });
    expect(dto.name).toBe('Maria da Silva');
  });

  it('explica o erro em português', () => {
    const [error] = validateSync(
      plainToInstance(CustomerDto, { ...base, name: 'Maria' }),
    );
    expect(Object.values(error.constraints ?? {})).toContain(
      'Informe nome e sobrenome.',
    );
  });
});
