import { Injectable } from '@nestjs/common';

@Injectable()
export class WhatsAppClientService {
  private readonly baseUrl = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  async sendText(to: string, body: string): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
  }

  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonText: string,
    rows: { id: string; title: string }[],
  ): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: { button: buttonText, sections: [{ rows }] },
      },
    });
  }

  private async post(payload: Record<string, unknown>): Promise<void> {
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
      throw new Error(errorBody?.error?.message ?? `WhatsApp API error (${response.status})`);
    }
  }
}
