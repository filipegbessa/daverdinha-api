import { Injectable } from '@nestjs/common';

interface WhatsAppSendResponse {
  messaging_product?: string;
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
}

/** Só o que sabemos armazenar e exibir. */
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Teto da própria Meta para imagem; repetido aqui para não depender dela. */
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

/**
 * Prazos separados porque as duas etapas são muito diferentes: a primeira é um
 * JSON pequeno, a segunda pode trazer 5 MB. Somados ficam em 14s, dentro do
 * `maxDuration` de 30s da Vercel e com folga para o resto do webhook. Sem
 * prazo, uma Meta pendurada seguraria a requisição até o teto — o mesmo
 * problema que o `CepLookupService` já teve.
 */
const METADATA_TIMEOUT_MS = 4000;
const DOWNLOAD_TIMEOUT_MS = 10000;

export type DownloadedMedia =
  | { ok: true; buffer: Buffer; mimeType: string; sizeBytes: number }
  | { ok: false; reason: 'unsupported-type' | 'too-large' };

@Injectable()
export class WhatsAppClientService {
  private readonly baseUrl = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  async sendText(
    to: string,
    body: string,
    options?: { replyToWamid?: string },
  ): Promise<{ whatsappMessageId: string }> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    };
    if (options?.replyToWamid) {
      payload.context = { message_id: options.replyToWamid };
    }

    const response = await this.post(payload);
    return { whatsappMessageId: response.messages![0].id };
  }

  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonText: string,
    rows: { id: string; title: string }[],
  ): Promise<{ whatsappMessageId: string }> {
    const response = await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: { button: buttonText, sections: [{ rows }] },
      },
    });
    return { whatsappMessageId: response.messages![0].id };
  }

  async getProductNames(
    catalogId: string,
    retailerIds: string[],
  ): Promise<Record<string, string>> {
    if (retailerIds.length === 0) return {};

    const filter = encodeURIComponent(
      JSON.stringify({ retailer_id: { in: retailerIds } }),
    );
    const url = `https://graph.facebook.com/v20.0/${catalogId}/products?fields=name,retailer_id&filter=${filter}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_TOKEN}`,
      },
    });
    if (!response.ok) return {};

    const { data } = (await response.json()) as {
      data?: { name: string; retailer_id: string }[];
    };
    return Object.fromEntries(
      (data ?? []).map((item) => [item.retailer_id, item.name]),
    );
  }

  /**
   * Troca o id que veio no webhook pelo arquivo. São duas chamadas, ambas com
   * o `Bearer`: a primeira devolve metadados e uma `url`, a segunda baixa essa
   * url — que **não é pública** e vale só cinco minutos.
   *
   * A diferença entre os dois tipos de falha é proposital e importa:
   *
   * - **Validação** (tipo não suportado, arquivo grande demais) devolve
   *   `ok: false`. É definitivo: tentar de novo daria o mesmo resultado, e o
   *   chamador grava a mensagem como conteúdo inválido.
   * - **Transitória** (rede, 5xx, prazo estourado) **estoura**. O erro sobe
   *   até o webhook, que devolve a reivindicação do wamid, e a reentrega da
   *   Meta vira outra chance de pegar a foto. Engolir isso num `ok: false`
   *   perderia a imagem por um soluço de rede.
   *
   * O tamanho e o tipo são conferidos nos metadados, antes de baixar — não há
   * por que trazer 5 MB para descartar em seguida.
   */
  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    const metadataResponse = await fetch(
      `https://graph.facebook.com/v20.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_TOKEN}`,
        },
        signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      },
    );
    if (!metadataResponse.ok) {
      throw new Error(
        `WhatsApp media metadata failed (${metadataResponse.status})`,
      );
    }

    const metadata = (await metadataResponse.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    };
    if (!metadata.url) {
      throw new Error('WhatsApp media metadata carried no url');
    }

    const mimeType = metadata.mime_type ?? '';
    if (!ALLOWED_MEDIA_TYPES.includes(mimeType)) {
      return { ok: false, reason: 'unsupported-type' };
    }
    if ((metadata.file_size ?? 0) > MAX_MEDIA_BYTES) {
      return { ok: false, reason: 'too-large' };
    }

    const fileResponse = await fetch(metadata.url, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_TOKEN}`,
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!fileResponse.ok) {
      throw new Error(
        `WhatsApp media download failed (${fileResponse.status})`,
      );
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    // O `file_size` dos metadados é o que a Meta diz; este é o que chegou.
    // Guardamos o segundo, porque é ele que ocupa espaço no bucket.
    return { ok: true, buffer, mimeType, sizeBytes: buffer.byteLength };
  }

  private async post(
    payload: Record<string, unknown>,
  ): Promise<WhatsAppSendResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(
        errorBody?.error?.message ?? `WhatsApp API error (${response.status})`,
      );
    }

    return response.json();
  }
}
