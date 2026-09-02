import { WhatsAppClientService } from './whatsapp-client.service';

describe('WhatsAppClientService', () => {
  let service: WhatsAppClientService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.WHATSAPP_CLOUD_API_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as any;
    service = new WhatsAppClientService();
  });

  it('sendText() posts a text message to the Graph API', async () => {
    await service.sendText('5521999999999', 'Oi!');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v20.0/1234567890/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '5521999999999',
      type: 'text',
      text: { body: 'Oi!' },
    });
  });

  it('sendInteractiveList() posts an interactive list message', async () => {
    await service.sendInteractiveList(
      '5521999999999',
      'Como posso ajudar?',
      'Ver opções',
      [{ id: 'item-1', title: 'Locais de entrega' }],
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '5521999999999',
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'Como posso ajudar?' },
        action: {
          button: 'Ver opções',
          sections: [{ rows: [{ id: 'item-1', title: 'Locais de entrega' }] }],
        },
      },
    });
  });

  it('throws when the Graph API responds with an error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'bad request' } }),
    });
    await expect(service.sendText('5521999999999', 'Oi!')).rejects.toThrow(
      'bad request',
    );
  });
});
