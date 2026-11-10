/**
 * Regras de upload compartilhadas: o formato do arquivo que o Multer entrega,
 * os tipos aceitos, os tetos e o mapa tipo → extensão das chaves de storage.
 */

/**
 * A forma mínima do arquivo que o Multer entrega (foto do catálogo, imagem ou
 * áudio do WhatsApp). Declarada aqui em vez de depender de `@types/multer`,
 * que o projeto não instala; só estes campos são usados.
 */
export interface UploadedFileData {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const MB = 1024 * 1024;

/** Os mesmos três tipos valem pra foto do site e pra imagem do WhatsApp. */
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Foto do catálogo do site (Vercel Blob). Teto nosso, não de terceiros. */
export const SITE_IMAGE_MAX_BYTES = 5 * MB;

/**
 * Tetos da própria Meta (Cloud API), repetidos aqui pra não depender dela.
 * Coincidir com o do site na imagem é acaso: um pode mudar sem o outro.
 */
export const WHATSAPP_IMAGE_MAX_BYTES = 5 * MB;
export const WHATSAPP_AUDIO_MAX_BYTES = 16 * MB;

/**
 * Tipos de áudio exatamente como a Cloud API aceita no envio. `audio/webm`,
 * que é o que o Chrome grava por padrão, **não** está entre eles.
 */
export const WHATSAPP_AUDIO_MIME_TYPES = [
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/amr',
];

/** Extensão da chave no storage; cobre todo tipo aceito acima. */
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
};

/** `bin` pro tipo desconhecido: a chave nunca fica sem extensão. */
export function extensionFor(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType] ?? 'bin';
}

/** `5242880` → `"5 MB"`, pra mensagem de erro sair do mesmo número do teto. */
export function formatMegabytes(bytes: number): string {
  return `${Math.round((bytes / MB) * 10) / 10} MB`;
}
