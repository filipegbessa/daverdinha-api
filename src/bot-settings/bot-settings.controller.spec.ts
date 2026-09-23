import { Test } from '@nestjs/testing';
import { BotSettingsController } from './bot-settings.controller';
import { BotSettingsService } from './bot-settings.service';

describe('BotSettingsController', () => {
  let controller: BotSettingsController;
  let service: { get: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    service = { get: jest.fn(), update: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [BotSettingsController],
      providers: [{ provide: BotSettingsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(BotSettingsController);
  });

  // mediaBytesUsed is a Postgres BigInt; returning it as-is would crash
  // JSON.stringify on the way out over HTTP.
  it('get() converts mediaBytesUsed from bigint to a plain number', async () => {
    service.get.mockResolvedValue({
      id: 1,
      botEnabled: true,
      mediaBytesUsed: 123456789n,
    });

    const result = await controller.get();

    expect(result).toEqual({
      id: 1,
      botEnabled: true,
      mediaBytesUsed: 123456789,
    });
    expect(typeof result.mediaBytesUsed).toBe('number');
  });

  it('update() forwards the dto and converts mediaBytesUsed on the response', async () => {
    const dto = { welcomeMessage: 'Oi!' };
    service.update.mockResolvedValue({
      id: 1,
      welcomeMessage: 'Oi!',
      mediaBytesUsed: 0n,
    });

    const result = await controller.update(dto);

    expect(service.update).toHaveBeenCalledWith(dto);
    expect(result.mediaBytesUsed).toBe(0);
  });
});
