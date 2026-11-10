import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { del, put } from '@vercel/blob';
import { extensionFor } from '../common/uploads';

/**
 * Fotos públicas do site (catálogo, e depois a agenda) no Vercel Blob.
 * Separado do `MediaStorageService` de propósito: aquele guarda mídia
 * privada do WhatsApp no R2, com URL pré-assinada; aqui a URL é pública e
 * vai direto pro `<img>` do site. O token vem de `BLOB_READ_WRITE_TOKEN`,
 * que o SDK lê sozinho.
 */
@Injectable()
export class BlobStorageService {
  async uploadProductImage(buffer: Buffer, mimeType: string): Promise<string> {
    const ext = extensionFor(mimeType);
    const { url } = await put(
      `products/${crypto.randomUUID()}.${ext}`,
      buffer,
      { access: 'public', contentType: mimeType },
    );
    return url;
  }

  async deleteImage(url: string): Promise<void> {
    await del(url);
  }
}
