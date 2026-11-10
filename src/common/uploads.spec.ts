import {
  IMAGE_MIME_TYPES,
  WHATSAPP_AUDIO_MIME_TYPES,
  extensionFor,
  formatMegabytes,
} from './uploads';

describe('uploads', () => {
  it('todo tipo aceito tem extensão conhecida', () => {
    for (const mime of [...IMAGE_MIME_TYPES, ...WHATSAPP_AUDIO_MIME_TYPES]) {
      expect(extensionFor(mime)).not.toBe('bin');
    }
  });

  it('tipo desconhecido vira bin', () => {
    expect(extensionFor('video/mp4')).toBe('bin');
  });

  it('formata o teto em MB', () => {
    expect(formatMegabytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatMegabytes(16 * 1024 * 1024)).toBe('16 MB');
    expect(formatMegabytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});
