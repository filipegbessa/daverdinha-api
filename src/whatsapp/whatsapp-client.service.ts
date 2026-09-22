import { Injectable } from '@nestjs/common';

interface WhatsAppSendResponse {
  messaging_product?: string;
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
}

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

  async getProductNames(catalogId: string, retailerIds: string[]): Promise<Record<string, string>> {
    if (retailerIds.length === 0) return {};

    const filter = encodeURIComponent(JSON.stringify({ retailer_id: { in: retailerIds } }));
    const url = `https://graph.facebook.com/v20.0/${catalogId}/products?fields=name,retailer_id&filter=${filter}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_API_TOKEN}` },
    });
    if (!response.ok) return {};

    const { data } = (await response.json()) as { data?: { name: string; retailer_id: string }[] };
    return Object.fromEntries((data ?? []).map((item) => [item.retailer_id, item.name]));
  }

  private async post(payload: Record<string, unknown>): Promise<WhatsAppSendResponse> {
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
