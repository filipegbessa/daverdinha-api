import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListConversationsDto } from './list-conversations.dto';

describe('ListConversationsDto', () => {
  it('aceita categoryId UUID e converte unread da query string', async () => {
    const dto = plainToInstance(ListConversationsDto, {
      categoryId: '7d3f1f0e-3b7a-4c64-9a53-0c2b8f1d2e4a',
      unread: 'true',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.unread).toBe(true);
  });

  it('recusa categoryId que não é UUID', async () => {
    const dto = plainToInstance(ListConversationsDto, { categoryId: 'abc' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isUuid');
  });
});
