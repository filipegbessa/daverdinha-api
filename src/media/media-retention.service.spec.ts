import { Test } from '@nestjs/testing';
import { MediaRetentionService } from './media-retention.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaStorageService } from './media-storage.service';

describe('MediaRetentionService', () => {
  let service: MediaRetentionService;
  let prisma: {
    message: { findMany: jest.Mock; update: jest.Mock; aggregate: jest.Mock };
    botSettings: { update: jest.Mock };
  };
  let mediaStorage: { delete: jest.Mock };

  beforeEach(async () => {
    prisma = {
      message: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { mediaSizeBytes: 0 } }),
      },
      botSettings: { update: jest.fn().mockResolvedValue({}) },
    };
    mediaStorage = { delete: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaRetentionService,
        { provide: PrismaService, useValue: prisma },
        { provide: MediaStorageService, useValue: mediaStorage },
      ],
    }).compile();

    service = moduleRef.get(MediaRetentionService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('purgeExpired()', () => {
    it('queries only images past 3 years with a file still attached', async () => {
      await service.purgeExpired();

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            kind: 'image',
            mediaKey: { not: null },
            createdAt: { lt: expect.any(Date) },
          },
          take: 50,
          select: { id: true, mediaKey: true },
        }),
      );
    });

    it('deletes from R2 before nulling the media columns, not after', async () => {
      prisma.message.findMany
        .mockResolvedValueOnce([
          { id: 'm1', mediaKey: 'conversations/c1/a.jpg' },
        ])
        .mockResolvedValueOnce([]);
      const calls: string[] = [];
      mediaStorage.delete.mockImplementation(() => {
        calls.push('r2-delete');
        return Promise.resolve();
      });
      prisma.message.update.mockImplementation(() => {
        calls.push('db-update');
        return Promise.resolve({});
      });

      await service.purgeExpired();

      expect(calls).toEqual(['r2-delete', 'db-update']);
      expect(mediaStorage.delete).toHaveBeenCalledWith(
        'conversations/c1/a.jpg',
      );
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { mediaKey: null, mediaMimeType: null, mediaSizeBytes: null },
      });
    });

    // A mensagem some do balde de "tem mídia pendurada" só quando o banco
    // confirma — se o R2 falhar, a próxima execução tenta de novo.
    it('propagates an R2 failure without touching the database row', async () => {
      prisma.message.findMany.mockResolvedValueOnce([
        { id: 'm1', mediaKey: 'conversations/c1/a.jpg' },
      ]);
      mediaStorage.delete.mockRejectedValue(new Error('R2 down'));

      await expect(service.purgeExpired()).rejects.toThrow('R2 down');
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('keeps fetching batches until one comes back empty', async () => {
      const batch1 = Array.from({ length: 50 }, (_, i) => ({
        id: `m${i}`,
        mediaKey: `conversations/c1/${i}.jpg`,
      }));
      prisma.message.findMany
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce([]);

      const result = await service.purgeExpired();

      expect(result.purged).toBe(50);
      expect(prisma.message.findMany).toHaveBeenCalledTimes(2);
    });

    it('stops within its time budget instead of draining the whole backlog', async () => {
      const batch = [
        { id: 'm1', mediaKey: 'a.jpg' },
        { id: 'm2', mediaKey: 'b.jpg' },
        { id: 'm3', mediaKey: 'c.jpg' },
      ];
      prisma.message.findMany.mockResolvedValue(batch);

      // Robust to exactly how many times the code calls Date.now(): the
      // clock reports "in budget" until the first file is actually
      // deleted, then "over budget" forever after — whatever the call
      // count, one item is the right answer.
      let overBudget = false;
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => (overBudget ? 25_000 : 0));
      mediaStorage.delete.mockImplementation(() => {
        overBudget = true;
        return Promise.resolve();
      });

      const result = await service.purgeExpired();

      expect(result.purged).toBe(1);
      expect(mediaStorage.delete).toHaveBeenCalledTimes(1);
      nowSpy.mockRestore();
    });
  });

  describe('reconcileUsage()', () => {
    it('sums mediaSizeBytes only over messages that still have a file', async () => {
      await service.reconcileUsage();

      expect(prisma.message.aggregate).toHaveBeenCalledWith({
        _sum: { mediaSizeBytes: true },
        where: { mediaKey: { not: null } },
      });
    });

    it('writes the sum onto BotSettings.mediaBytesUsed as a bigint', async () => {
      prisma.message.aggregate.mockResolvedValue({
        _sum: { mediaSizeBytes: 123456789 },
      });

      const result = await service.reconcileUsage();

      expect(result.mediaBytesUsed).toBe(123456789n);
      expect(prisma.botSettings.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { mediaBytesUsed: 123456789n },
      });
    });

    it('writes zero when there is no media at all, instead of leaving the counter stale', async () => {
      prisma.message.aggregate.mockResolvedValue({
        _sum: { mediaSizeBytes: null },
      });

      const result = await service.reconcileUsage();

      expect(result.mediaBytesUsed).toBe(0n);
      expect(prisma.botSettings.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { mediaBytesUsed: 0n },
      });
    });
  });
});
