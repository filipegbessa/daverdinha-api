import { Test } from '@nestjs/testing';
import { MediaRetentionController } from './media-retention.controller';
import { MediaRetentionService } from './media-retention.service';

describe('MediaRetentionController', () => {
  let controller: MediaRetentionController;
  let service: { purgeExpired: jest.Mock; reconcileUsage: jest.Mock };

  beforeEach(async () => {
    service = {
      purgeExpired: jest.fn().mockResolvedValue({ purged: 3 }),
      reconcileUsage: jest
        .fn()
        .mockResolvedValue({ mediaBytesUsed: 123456789n }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MediaRetentionController],
      providers: [{ provide: MediaRetentionService, useValue: service }],
    }).compile();

    controller = moduleRef.get(MediaRetentionController);
  });

  it('purges before reconciling, not the other way around', async () => {
    const order: string[] = [];
    service.purgeExpired.mockImplementation(() => {
      order.push('purge');
      return Promise.resolve({ purged: 3 });
    });
    service.reconcileUsage.mockImplementation(() => {
      order.push('reconcile');
      return Promise.resolve({ mediaBytesUsed: 0n });
    });

    await controller.run();

    expect(order).toEqual(['purge', 'reconcile']);
  });

  // BigInt cru quebraria JSON.stringify na resposta HTTP.
  it('serializes mediaBytesUsed as a string, not a raw bigint', async () => {
    const result = await controller.run();

    expect(result).toEqual({ purged: 3, mediaBytesUsed: '123456789' });
    expect(typeof result.mediaBytesUsed).toBe('string');
  });
});
