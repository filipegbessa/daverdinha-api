import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HeroSlidesService, isLive } from './hero-slides.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { BlobStorageService } from '../media/blob-storage.service';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    eyebrow: 'Oficina no ateliê',
    title: 'Monte seu terrário',
    description: null as string | null,
    imageUrl: null as string | null,
    linkLabel: 'Ver agenda' as string | null,
    linkUrl: '/agenda' as string | null,
    whatsappLabel: null as string | null,
    whatsappMessage: null as string | null,
    order: 0,
    active: true,
    startsAt: null as Date | null,
    endsAt: null as Date | null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

const image = { buffer: Buffer.from('img'), mimetype: 'image/webp' };

describe('isLive', () => {
  const now = new Date('2026-11-18T12:00:00Z');

  it('needs the slide on and inside its dates', () => {
    expect(isLive(row(), now)).toBe(true);
    expect(isLive(row({ active: false }), now)).toBe(false);
    expect(
      isLive(row({ startsAt: new Date('2026-11-19T00:00:00Z') }), now),
    ).toBe(false);
    expect(isLive(row({ endsAt: now }), now)).toBe(false);
    expect(
      isLive(
        row({
          startsAt: new Date('2026-11-01T00:00:00Z'),
          endsAt: new Date('2026-12-01T00:00:00Z'),
        }),
        now,
      ),
    ).toBe(true);
  });
});

describe('HeroSlidesService', () => {
  let service: HeroSlidesService;
  let prisma: {
    heroSlide: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let blob: {
    uploadHeroImage: jest.Mock;
    deleteImage: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      heroSlide: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _max: { order: 2 } }),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    blob = {
      uploadHeroImage: jest
        .fn()
        .mockResolvedValue('https://blob/hero/new.webp'),
      deleteImage: jest.fn().mockResolvedValue(undefined),
    };
    service = new HeroSlidesService(
      prisma as unknown as PrismaService,
      blob as unknown as BlobStorageService,
    );
  });

  describe('listActive', () => {
    it('filters by on and validity in the query, in display order', async () => {
      prisma.heroSlide.findMany.mockResolvedValue([row()]);

      const slides = await service.listActive();

      const args = prisma.heroSlide.findMany.mock.calls[0][0];
      expect(args.where.active).toBe(true);
      expect(args.where.AND).toHaveLength(2);
      expect(args.orderBy).toEqual([{ order: 'asc' }, { createdAt: 'asc' }]);
      expect(slides).toEqual([
        {
          id: 's1',
          eyebrow: 'Oficina no ateliê',
          title: 'Monte seu terrário',
          description: null,
          imageUrl: null,
          linkLabel: 'Ver agenda',
          linkUrl: '/agenda',
          whatsappLabel: null,
          whatsappMessage: null,
        },
      ]);
    });

    it('hides a half-filled main button', async () => {
      prisma.heroSlide.findMany.mockResolvedValue([row({ linkUrl: null })]);

      const [slide] = await service.listActive();

      expect(slide.linkLabel).toBeNull();
      expect(slide.linkUrl).toBeNull();
    });
  });

  describe('create', () => {
    it('puts the new slide last, with the uploaded image', async () => {
      prisma.heroSlide.create.mockImplementation(({ data }) =>
        Promise.resolve(row(data)),
      );

      const created = await service.create(
        {
          title: 'Kits pra presentear',
          startsAt: '2026-12-01T03:00:00Z',
          endsAt: null,
        },
        image,
      );

      expect(prisma.heroSlide.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Kits pra presentear',
          order: 3,
          imageUrl: 'https://blob/hero/new.webp',
          startsAt: new Date('2026-12-01T03:00:00Z'),
          endsAt: null,
        }),
      });
      expect(created.live).toBe(false);
    });

    it('starts at 0 when there is no slide yet', async () => {
      prisma.heroSlide.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.heroSlide.create.mockImplementation(({ data }) =>
        Promise.resolve(row(data)),
      );

      await service.create({ title: 'Primeiro' });

      expect(prisma.heroSlide.create.mock.calls[0][0].data.order).toBe(0);
    });

    it('refuses a button with text and no link, before uploading', async () => {
      await expect(
        service.create({ title: 'T', linkLabel: 'Ver' }, image),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(blob.uploadHeroImage).not.toHaveBeenCalled();
    });

    it('refuses an end before the start', async () => {
      await expect(
        service.create({
          title: 'T',
          startsAt: '2026-12-02T00:00:00Z',
          endsAt: '2026-12-01T00:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes the uploaded image when the insert fails', async () => {
      prisma.heroSlide.create.mockRejectedValue(new Error('db down'));

      await expect(service.create({ title: 'T' }, image)).rejects.toThrow(
        'db down',
      );
      expect(blob.deleteImage).toHaveBeenCalledWith(
        'https://blob/hero/new.webp',
      );
    });
  });

  describe('update', () => {
    it('checks the button against what is saved', async () => {
      prisma.heroSlide.findUnique.mockResolvedValue(row());

      await expect(
        service.update('s1', { linkUrl: null }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(blob.uploadHeroImage).not.toHaveBeenCalled();

      prisma.heroSlide.update.mockImplementation(({ data }) =>
        Promise.resolve(row(data)),
      );
      const cleared = await service.update('s1', {
        linkLabel: null,
        linkUrl: null,
      });
      expect(cleared.linkLabel).toBeNull();
    });

    it('swaps the image and deletes the old one after saving', async () => {
      prisma.heroSlide.findUnique.mockResolvedValue(
        row({ imageUrl: 'https://blob/hero/old.webp' }),
      );
      prisma.heroSlide.update.mockImplementation(({ data }) =>
        Promise.resolve(row(data)),
      );

      const updated = await service.update('s1', { title: 'Novo' }, image);

      expect(updated.imageUrl).toBe('https://blob/hero/new.webp');
      expect(blob.deleteImage).toHaveBeenCalledWith(
        'https://blob/hero/old.webp',
      );
    });

    it('removes the image without a new one', async () => {
      prisma.heroSlide.findUnique.mockResolvedValue(
        row({ imageUrl: 'https://blob/hero/old.webp' }),
      );
      prisma.heroSlide.update.mockImplementation(({ data }) =>
        Promise.resolve(row(data)),
      );

      await service.update('s1', { removeImage: true });

      expect(prisma.heroSlide.update.mock.calls[0][0].data.imageUrl).toBeNull();
      expect(blob.deleteImage).toHaveBeenCalledWith(
        'https://blob/hero/old.webp',
      );
    });

    it('answers 404 for a missing slide', async () => {
      prisma.heroSlide.findUnique.mockResolvedValue(null);

      await expect(service.update('x', { title: 'T' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reorder', () => {
    it('writes the new positions in one transaction', async () => {
      prisma.$transaction.mockResolvedValue([]);
      prisma.heroSlide.update.mockReturnValue('op');

      await service.reorder({ orderedIds: ['b', 'a'] });

      expect(prisma.heroSlide.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'b' },
        data: { order: 0 },
      });
      expect(prisma.heroSlide.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'a' },
        data: { order: 1 },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(['op', 'op']);
    });

    it('answers 404 when an id does not exist', async () => {
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.reorder({ orderedIds: ['x'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('remove deletes the row and then its image', async () => {
    prisma.heroSlide.findUnique.mockResolvedValue(
      row({ imageUrl: 'https://blob/hero/old.webp' }),
    );

    await service.remove('s1');

    expect(prisma.heroSlide.delete).toHaveBeenCalledWith({
      where: { id: 's1' },
    });
    expect(blob.deleteImage).toHaveBeenCalledWith('https://blob/hero/old.webp');
  });
});
