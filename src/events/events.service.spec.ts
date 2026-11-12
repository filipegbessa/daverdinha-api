import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { BlobStorageService } from '../media/blob-storage.service';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    title: 'Oficina de terrário',
    slug: 'oficina-de-terrario',
    description: 'Monte o seu terrário.',
    startsAt: new Date('2026-11-21T13:00:00Z'),
    endsAt: new Date('2026-11-21T15:00:00Z'),
    locationName: null,
    locationAddress: null,
    price: new Prisma.Decimal('120.00') as Prisma.Decimal | null,
    spots: 8 as number | null,
    imageUrl: null as string | null,
    ctaUrl: null,
    published: false,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

const dto = {
  title: 'Oficina de terrário',
  description: 'Monte o seu terrário.',
  startsAt: '2026-11-21T13:00:00Z',
  endsAt: '2026-11-21T15:00:00Z',
};

const cover = { buffer: Buffer.from('img'), mimetype: 'image/webp' };

describe('EventsService', () => {
  let service: EventsService;
  let prisma: { event: Record<string, jest.Mock> };
  let blob: { uploadEventImage: jest.Mock; deleteImage: jest.Mock };

  beforeEach(async () => {
    prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(row()),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(({ data }) => row(data)),
        update: jest.fn(({ data }) => row(data)),
        delete: jest.fn(),
      },
    };
    blob = {
      uploadEventImage: jest
        .fn()
        .mockResolvedValue('https://blob/events/new.webp'),
      deleteImage: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: BlobStorageService, useValue: blob },
      ],
    }).compile();
    service = moduleRef.get(EventsService);
  });

  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    it('generates the slug from the title', async () => {
      await service.create({ ...dto, title: 'Oficina de Kokedama' });

      expect(prisma.event.create.mock.calls[0][0].data.slug).toBe(
        'oficina-de-kokedama',
      );
    });

    it('never takes the reserved slug "upcoming"', async () => {
      await service.create({ ...dto, title: 'Upcoming' });

      expect(prisma.event.create.mock.calls[0][0].data.slug).toBe('upcoming-2');
    });

    it('rejects an event that ends before it starts', async () => {
      await expect(
        service.create({ ...dto, endsAt: '2026-11-21T12:00:00Z' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('starts as a draft when published is not sent', async () => {
      const event = await service.create(dto);

      expect(
        prisma.event.create.mock.calls[0][0].data.published,
      ).toBeUndefined();
      expect(event.published).toBe(false);
    });

    it('uploads the cover and stores its URL', async () => {
      const event = await service.create(dto, cover);

      expect(blob.uploadEventImage).toHaveBeenCalledWith(
        cover.buffer,
        'image/webp',
      );
      expect(event.imageUrl).toBe('https://blob/events/new.webp');
    });

    it('deletes the uploaded cover when the insert fails', async () => {
      prisma.event.create.mockRejectedValue(new Error('db down'));

      await expect(service.create(dto, cover)).rejects.toThrow('db down');
      expect(blob.deleteImage).toHaveBeenCalledWith(
        'https://blob/events/new.webp',
      );
    });

    it('returns price as a number, or null when free', async () => {
      expect((await service.create({ ...dto, price: 120 })).price).toBe(120);
      prisma.event.create.mockImplementation(({ data }) =>
        row({ ...data, price: null }),
      );
      expect((await service.create({ ...dto, price: null })).price).toBeNull();
    });
  });

  describe('update', () => {
    it('keeps the slug when the title changes', async () => {
      await service.update('e1', { title: 'Outro nome' });

      expect(prisma.event.update.mock.calls[0][0].data.slug).toBeUndefined();
    });

    it('checks a partial date change against the stored dates', async () => {
      await expect(
        service.update('e1', { endsAt: '2026-11-21T12:00:00Z' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores null when an optional field is cleared', async () => {
      await service.update('e1', { price: null, spots: null, ctaUrl: null });

      const { data } = prisma.event.update.mock.calls[0][0];
      expect(data.price).toBeNull();
      expect(data.spots).toBeNull();
      expect(data.ctaUrl).toBeNull();
    });

    it('replaces the cover and deletes the old one after saving', async () => {
      prisma.event.findUnique.mockResolvedValue(
        row({ imageUrl: 'https://blob/events/old.webp' }),
      );

      await service.update('e1', {}, cover);

      expect(prisma.event.update.mock.calls[0][0].data.imageUrl).toBe(
        'https://blob/events/new.webp',
      );
      expect(blob.deleteImage).toHaveBeenCalledWith(
        'https://blob/events/old.webp',
      );
    });

    it('removes the cover when asked', async () => {
      prisma.event.findUnique.mockResolvedValue(
        row({ imageUrl: 'https://blob/events/old.webp' }),
      );

      await service.update('e1', { removeImage: true });

      const { data } = prisma.event.update.mock.calls[0][0];
      expect(data.imageUrl).toBeNull();
      expect(data.removeImage).toBeUndefined();
      expect(blob.deleteImage).toHaveBeenCalledWith(
        'https://blob/events/old.webp',
      );
    });

    it('answers 404 for an unknown event', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the row and then its cover', async () => {
      prisma.event.findUnique.mockResolvedValue(
        row({ imageUrl: 'https://blob/events/old.webp' }),
      );

      await service.remove('e1');

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
      expect(blob.deleteImage).toHaveBeenCalledWith(
        'https://blob/events/old.webp',
      );
    });
  });

  describe('listUpcoming', () => {
    it('returns [] when nothing is coming', async () => {
      expect(await service.listUpcoming()).toEqual([]);
    });

    it('asks for published events that have not ended, soonest first', async () => {
      await service.listUpcoming();

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { published: true, endsAt: { gte: expect.any(Date) } },
        orderBy: { startsAt: 'asc' },
      });
    });

    it('computes "now" on every call', async () => {
      jest.useFakeTimers({ now: new Date('2026-11-20T10:00:00Z') });
      await service.listUpcoming();
      jest.setSystemTime(new Date('2026-11-20T11:00:00Z'));
      await service.listUpcoming();

      const [first, second] = prisma.event.findMany.mock.calls.map(
        (c) => c[0].where.endsAt.gte as Date,
      );
      expect(second.getTime() - first.getTime()).toBe(60 * 60 * 1000);
    });

    it('exposes only the public fields, with ISO dates', async () => {
      prisma.event.findMany.mockResolvedValue([row({ published: true })]);

      const [event] = await service.listUpcoming();

      expect(event).not.toHaveProperty('published');
      expect(event).not.toHaveProperty('createdAt');
      expect(event.startsAt).toBe('2026-11-21T13:00:00.000Z');
      expect(event.price).toBe(120);
    });
  });

  describe('findPublishedBySlug', () => {
    it('returns a published event even after it ended', async () => {
      prisma.event.findFirst.mockResolvedValue(
        row({ published: true, endsAt: new Date('2020-01-01T00:00:00Z') }),
      );

      const event = await service.findPublishedBySlug('oficina-de-terrario');

      expect(event.slug).toBe('oficina-de-terrario');
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { slug: 'oficina-de-terrario', published: true },
      });
    });

    it('answers 404 for a draft or an unknown slug', async () => {
      await expect(service.findPublishedBySlug('rascunho')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('list (admin)', () => {
    it('includes drafts and past events, latest first, paginated and searchable', async () => {
      prisma.event.findMany.mockResolvedValue([row()]);
      prisma.event.count.mockResolvedValue(1);

      const page = await service.list({ q: ' terr ', page: 1, perPage: 20 });

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { title: { contains: 'terr', mode: 'insensitive' } },
        orderBy: { startsAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(page.total).toBe(1);
      expect(page.items[0].published).toBe(false);
    });
  });
});
