import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateConversationDto } from './update-conversation.dto';

async function parse(body: object) {
  const dto = plainToInstance(UpdateConversationDto, body);
  return { dto, errors: await validate(dto) };
}

describe('UpdateConversationDto', () => {
  it('trims the name', async () => {
    const { dto, errors } = await parse({ name: '  Maria ' });
    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('Maria');
  });

  it('clears the name when it comes empty or blank, so the phone shows again', async () => {
    for (const name of ['', '   ', null]) {
      const { dto, errors } = await parse({ name });
      expect(errors).toHaveLength(0);
      expect(dto.name).toBeNull();
    }
  });

  it('rejects a non-string name', async () => {
    const { errors } = await parse({ name: 123 });
    expect(errors).not.toHaveLength(0);
  });
});
