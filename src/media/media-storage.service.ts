import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Só os tipos que o `WhatsAppClientService.downloadMedia` já deixa passar —
 * manter os dois em sincronia é o que impede uma chave sem extensão
 * reconhecível.
 */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Vida curta de propósito: o bucket é privado (comprovante de pagamento
 * passa por aqui) e a URL só existe para o admin abrir a imagem na hora,
 * nunca para ficar guardada em cache do cliente.
 */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * `conversations/{conversationId}/{uuid}.{ext}` — nada adivinhável, e o
 * `conversationId` no caminho é só para navegação manual no console do R2;
 * a única forma de acesso de verdade é a URL pré-assinada.
 */
export function buildMediaKey(
  conversationId: string,
  mimeType: string,
): string {
  const ext = MIME_EXTENSIONS[mimeType] ?? 'bin';
  return `conversations/${conversationId}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Fala com o R2 pelo protocolo do S3 (`@aws-sdk/client-s3`), o que é o que
 * torna egress grátis — ler a imagem repetidas vezes no admin não custa nada.
 * Interface enxuta de propósito: trocar de provedor de storage não deveria
 * mexer em mais nada além deste arquivo.
 */
@Injectable()
export class MediaStorageService {
  private readonly bucket = process.env.R2_BUCKET as string;
  private readonly client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  });

  async put(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  }

  /**
   * `download: true` força `Content-Disposition: attachment`, que é o que
   * faz o navegador salvar o arquivo em vez de tentar abri-lo — usado pelo
   * botão "baixar" do admin.
   */
  async signedUrl(
    key: string,
    options?: { download?: boolean },
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options?.download
        ? { ResponseContentDisposition: 'attachment' }
        : {}),
    });
    return getSignedUrl(this.client, command, {
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
  }
}
