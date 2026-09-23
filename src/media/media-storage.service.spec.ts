const sendMock = jest.fn((command: unknown) => Promise.resolve(command));
jest.mock('@aws-sdk/client-s3', () => {
  const actual: typeof import('@aws-sdk/client-s3') =
    jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  };
});

const getSignedUrlMock = jest.fn((...args: unknown[]) =>
  Promise.resolve(`mock-url:${args.length}`),
);
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

import { buildMediaKey, MediaStorageService } from './media-storage.service';

describe('MediaStorageService', () => {
  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
    process.env.R2_BUCKET = 'test-bucket';
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  });

  it('uploads the buffer under the given key and mime type', async () => {
    sendMock.mockResolvedValue({});
    const service = new MediaStorageService();

    await service.put(
      'conversations/abc/uuid.jpg',
      Buffer.from('photo-bytes'),
      'image/jpeg',
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as { input: unknown };
    expect(command.input).toEqual({
      Bucket: 'test-bucket',
      Key: 'conversations/abc/uuid.jpg',
      Body: Buffer.from('photo-bytes'),
      ContentType: 'image/jpeg',
    });
  });

  it('signs a plain GET url when no options are given', async () => {
    getSignedUrlMock.mockResolvedValue('https://signed.example/photo.jpg');
    const service = new MediaStorageService();

    const url = await service.signedUrl('conversations/abc/uuid.jpg');

    expect(url).toBe('https://signed.example/photo.jpg');
    const [, command, opts] = getSignedUrlMock.mock.calls[0] as [
      unknown,
      { input: Record<string, unknown> },
      { expiresIn: number },
    ];
    expect(command.input).toEqual({
      Bucket: 'test-bucket',
      Key: 'conversations/abc/uuid.jpg',
    });
    // 5 minutos — o bucket é privado, a url não deve sobreviver muito além
    // do clique que a gerou.
    expect(opts).toEqual({ expiresIn: 300 });
  });

  it('adds an attachment content-disposition when download is requested', async () => {
    getSignedUrlMock.mockResolvedValue('https://signed.example/photo.jpg');
    const service = new MediaStorageService();

    await service.signedUrl('conversations/abc/uuid.jpg', { download: true });

    const [, command] = getSignedUrlMock.mock.calls[0] as [
      unknown,
      { input: Record<string, unknown> },
    ];
    expect(command.input.ResponseContentDisposition).toBe('attachment');
  });

  it('deletes an object by key', async () => {
    sendMock.mockResolvedValue({});
    const service = new MediaStorageService();

    await service.delete('conversations/abc/uuid.jpg');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0] as { input: unknown };
    expect(command.input).toEqual({
      Bucket: 'test-bucket',
      Key: 'conversations/abc/uuid.jpg',
    });
  });
});

describe('buildMediaKey', () => {
  it('scopes the key to the conversation and keeps a recognizable extension', () => {
    const key = buildMediaKey('conv-1', 'image/png');
    expect(key).toMatch(/^conversations\/conv-1\/[0-9a-f-]{36}\.png$/);
  });

  it('gives each call a different key, so nothing gets overwritten', () => {
    const first = buildMediaKey('conv-1', 'image/jpeg');
    const second = buildMediaKey('conv-1', 'image/jpeg');
    expect(first).not.toBe(second);
  });

  it('falls back to a generic extension for a mime type outside the allow-list', () => {
    const key = buildMediaKey('conv-1', 'application/octet-stream');
    expect(key).toMatch(/\.bin$/);
  });
});
