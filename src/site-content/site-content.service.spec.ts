import { SiteContentService } from './site-content.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { BlobStorageService } from '../media/blob-storage.service';

const saved = {
  id: 1,
  aboutTitle: 'Um espaço pra plantar',
  aboutText: 'Primeiro.\n\nSegundo.',
  aboutImageUrl: 'https://blob/site/old.webp' as string | null,
  aboutInstagramLabel: '@daverdinha' as string | null,
  updatedAt: new Date('2026-11-18T12:00:00Z'),
};

const image = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' };

describe('SiteContentService', () => {
  let service: SiteContentService;
  let prisma: { siteContent: { findUnique: jest.Mock; upsert: jest.Mock } };
  let blob: { uploadSiteImage: jest.Mock; deleteImage: jest.Mock };

  beforeEach(() => {
    prisma = {
      siteContent: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    blob = {
      uploadSiteImage: jest
        .fn()
        .mockResolvedValue('https://blob/site/new.webp'),
      deleteImage: jest.fn().mockResolvedValue(undefined),
    };
    service = new SiteContentService(
      prisma as unknown as PrismaService,
      blob as unknown as BlobStorageService,
    );
  });

  it('says "not configured" before the first save', async () => {
    prisma.siteContent.findUnique.mockResolvedValue(null);

    expect(await service.getAbout()).toEqual({
      configured: false,
      title: null,
      text: null,
      imageUrl: null,
      instagramLabel: null,
      updatedAt: null,
    });
  });

  it('returns what was saved', async () => {
    prisma.siteContent.findUnique.mockResolvedValue(saved);

    expect(await service.getAbout()).toMatchObject({
      configured: true,
      title: 'Um espaço pra plantar',
      instagramLabel: '@daverdinha',
      updatedAt: '2026-11-18T12:00:00.000Z',
    });
  });

  it('creates the row on the first save, without touching the image', async () => {
    prisma.siteContent.findUnique.mockResolvedValue(null);

    await service.updateAbout({ title: 'T', text: 'X', instagramLabel: null });

    expect(prisma.siteContent.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: {
        id: 1,
        aboutTitle: 'T',
        aboutText: 'X',
        aboutInstagramLabel: null,
      },
      update: { aboutTitle: 'T', aboutText: 'X', aboutInstagramLabel: null },
    });
    expect(blob.deleteImage).not.toHaveBeenCalled();
  });

  it('swaps the photo and deletes the old one after saving', async () => {
    prisma.siteContent.findUnique.mockResolvedValue(saved);

    await service.updateAbout({ title: 'T', text: 'X' }, image);

    expect(prisma.siteContent.upsert.mock.calls[0][0].update).toMatchObject({
      aboutImageUrl: 'https://blob/site/new.webp',
    });
    expect(blob.deleteImage).toHaveBeenCalledWith('https://blob/site/old.webp');
  });

  it('removes the photo on request', async () => {
    prisma.siteContent.findUnique.mockResolvedValue(saved);

    await service.updateAbout({ title: 'T', text: 'X', removeImage: true });

    expect(
      prisma.siteContent.upsert.mock.calls[0][0].update.aboutImageUrl,
    ).toBeNull();
    expect(blob.deleteImage).toHaveBeenCalledWith('https://blob/site/old.webp');
  });

  it('deletes the new photo when the save fails', async () => {
    prisma.siteContent.findUnique.mockResolvedValue(saved);
    prisma.siteContent.upsert.mockRejectedValue(new Error('db down'));

    await expect(
      service.updateAbout({ title: 'T', text: 'X' }, image),
    ).rejects.toThrow('db down');
    expect(blob.deleteImage).toHaveBeenCalledWith('https://blob/site/new.webp');
    expect(blob.deleteImage).not.toHaveBeenCalledWith(
      'https://blob/site/old.webp',
    );
  });
});
