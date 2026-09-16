import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateMenuItemDto } from './create-menu-item.dto';

function buildDto(topic: string) {
  return plainToInstance(CreateMenuItemDto, { order: 0, topic, type: 'texto', reply: 'oi' });
}

describe('CreateMenuItemDto', () => {
  it('accepts a topic at the 24-character WhatsApp list-row limit', async () => {
    const errors = await validate(buildDto('a'.repeat(24)));

    expect(errors).toHaveLength(0);
  });

  it('rejects a topic longer than 24 characters — WhatsApp rejects the whole menu send otherwise (#131009)', async () => {
    const errors = await validate(buildDto('a'.repeat(25)));

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('topic');
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });
});
