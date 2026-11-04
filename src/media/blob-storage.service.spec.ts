import { del, put } from '@vercel/blob';
import { BlobStorageService } from './blob-storage.service';

jest.mock('@vercel/blob', () => ({ put: jest.fn(), del: jest.fn() }));

describe('BlobStorageService', () => {
  const service = new BlobStorageService();

  beforeEach(() => jest.clearAllMocks());

  it('uploads the buffer publicly under products/ and returns the public URL', async () => {
    (put as jest.Mock).mockResolvedValue({
      url: 'https://abc.public.blob.vercel-storage.com/products/x.jpg',
    });

    const url = await service.uploadProductImage(
      Buffer.from('fake'),
      'image/jpeg',
    );

    expect(url).toBe(
      'https://abc.public.blob.vercel-storage.com/products/x.jpg',
    );
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^products\/[0-9a-f-]{36}\.jpg$/),
      expect.any(Buffer),
      expect.objectContaining({ access: 'public', contentType: 'image/jpeg' }),
    );
  });

  it('keys each upload uniquely, so two photos never overwrite each other', async () => {
    (put as jest.Mock).mockResolvedValue({ url: 'u' });

    await service.uploadProductImage(Buffer.from('a'), 'image/png');
    await service.uploadProductImage(Buffer.from('b'), 'image/png');

    const [first, second] = (put as jest.Mock).mock.calls.map((c) => c[0]);
    expect(first).not.toBe(second);
    expect(first).toMatch(/\.png$/);
  });

  it('deletes by URL', async () => {
    await service.deleteImage(
      'https://abc.public.blob.vercel-storage.com/products/x.jpg',
    );
    expect(del).toHaveBeenCalledWith(
      'https://abc.public.blob.vercel-storage.com/products/x.jpg',
    );
  });
});
