import { Test } from '@nestjs/testing';
import { BotSettingsController } from './bot-settings.controller';
import { BotSettingsService } from './bot-settings.service';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';

describe('BotSettingsController', () => {
  let controller: BotSettingsController;
  let service: { getView: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    service = { getView: jest.fn(), update: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [BotSettingsController],
      providers: [{ provide: BotSettingsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(BotSettingsController);
  });

  it('é protegido pelo ClerkAuthGuard', () => {
    expect(Reflect.getMetadata('__guards__', BotSettingsController)).toEqual([
      ClerkAuthGuard,
    ]);
  });

  // A conversão do mediaBytesUsed (BigInt) mora no service; aqui só repassa.
  it('get() devolve a view do service', async () => {
    const view = { id: 1, mediaBytesUsed: 123 };
    service.getView.mockResolvedValue(view);

    await expect(controller.get()).resolves.toBe(view);
  });

  it('update() repassa o dto ao service', async () => {
    const dto = { welcomeMessage: 'Oi!' };
    service.update.mockResolvedValue({ id: 1, mediaBytesUsed: 0 });

    await controller.update(dto);

    expect(service.update).toHaveBeenCalledWith(dto);
  });
});
