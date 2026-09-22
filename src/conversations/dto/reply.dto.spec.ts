import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReplyDto } from './reply.dto';

describe('ReplyDto', () => {
  it('is valid without replyToMessageId — it is optional', async () => {
    const dto = plainToInstance(ReplyDto, { text: 'Oi!' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('is valid when replyToMessageId is a string', async () => {
    const dto = plainToInstance(ReplyDto, {
      text: 'Oi!',
      replyToMessageId: 'm1',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string replyToMessageId', async () => {
    const dto = plainToInstance(ReplyDto, {
      text: 'Oi!',
      replyToMessageId: 123,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('replyToMessageId');
    expect(errors[0].constraints).toHaveProperty('isString');
  });
});
