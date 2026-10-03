import { WhatsAppClientService } from './whatsapp-client.service';

describe('WhatsAppClientService', () => {
  let service: WhatsAppClientService;
  let fetchMock: jest.Mock;

  const mockSendResponse = {
    messaging_product: 'whatsapp',
    contacts: [{ input: '5521999999999', wa_id: '5521999999999' }],
    messages: [{ id: 'wamid.HHBHYjkTest' }],
  };

  beforeEach(() => {
    process.env.WHATSAPP_CLOUD_API_TOKEN = 'test-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mockSendResponse });
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

  it('sendText() sem options não inclui a chave context no payload e devolve o wamid', async () => {
    const result = await service.sendText('5521999999999', 'Oi!');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('context');
    expect(result).toEqual({ whatsappMessageId: 'wamid.HHBHYjkTest' });
  });

  it('sendText() com options.replyToWamid inclui context no payload', async () => {
    const result = await service.sendText('5521999999999', 'Oi!', {
      replyToWamid: 'wamid.ORIGINAL123',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '5521999999999',
      type: 'text',
      text: { body: 'Oi!' },
      context: { message_id: 'wamid.ORIGINAL123' },
    });
    expect(result).toEqual({ whatsappMessageId: 'wamid.HHBHYjkTest' });
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

  it('sendInteractiveList() devolve o whatsappMessageId da resposta mockada', async () => {
    const result = await service.sendInteractiveList(
      '5521999999999',
      'Como posso ajudar?',
      'Ver opções',
      [{ id: 'item-1', title: 'Locais de entrega' }],
    );

    expect(result).toEqual({ whatsappMessageId: 'wamid.HHBHYjkTest' });
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

  describe('downloadMedia()', () => {
    /** Passo 1 devolve metadados + a url; passo 2 devolve os bytes. */
    function mockTwoStep(
      meta: Record<string, unknown>,
      bytes = Buffer.from('fake-jpeg'),
    ) {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => meta })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () =>
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
        });
    }

    it('trades the id for the file in two authenticated calls', async () => {
      mockTwoStep({
        url: 'https://lookaside.fbsbx.com/whatsapp/abc',
        mime_type: 'image/jpeg',
        file_size: 9,
      });

      const result = await service.downloadMedia('media_123');

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://graph.facebook.com/v20.0/media_123',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
      // A url do passo 2 não é pública: precisa do Bearer de novo.
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://lookaside.fbsbx.com/whatsapp/abc',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
      expect(result).toMatchObject({
        ok: true,
        mimeType: 'image/jpeg',
        sizeBytes: 9,
      });
    });

    it('puts a deadline on both calls, so a hung Meta cannot hold the webhook', async () => {
      mockTwoStep({ url: 'https://x/y', mime_type: 'image/png', file_size: 9 });

      await service.downloadMedia('media_123');

      for (const call of fetchMock.mock.calls) {
        expect(call[1].signal).toBeInstanceOf(AbortSignal);
      }
    });

    it('rejects an unsupported type from the metadata, without downloading it', async () => {
      mockTwoStep({
        url: 'https://x/y',
        mime_type: 'image/tiff',
        file_size: 10,
      });

      const result = await service.downloadMedia('media_123');

      expect(result).toEqual({ ok: false, reason: 'unsupported-type' });
      // Só o passo 1 rodou: não faz sentido baixar o que será descartado.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects an oversized file from the metadata, without downloading it', async () => {
      mockTwoStep({
        url: 'https://x/y',
        mime_type: 'image/jpeg',
        file_size: 6 * 1024 * 1024,
      });

      const result = await service.downloadMedia('media_123');

      expect(result).toEqual({ ok: false, reason: 'too-large' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // Regressão: o teto era conferido só contra o `file_size` que a Meta
    // declara. Sem esse campo, `0 > 5MB` é falso e o download acontecia sem
    // limite nenhum — carregando a resposta inteira em memória, dentro do
    // webhook.
    it('rejects an oversized body when the metadata declared no size', async () => {
      const huge = Buffer.alloc(6 * 1024 * 1024);
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ url: 'https://x/y', mime_type: 'image/jpeg' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () =>
            huge.buffer.slice(huge.byteOffset, huge.byteOffset + huge.byteLength),
        });

      const result = await service.downloadMedia('media_123');

      expect(result).toEqual({ ok: false, reason: 'too-large' });
    });

    it('trusts Content-Length to bail out before buffering the body', async () => {
      const arrayBuffer = jest.fn();
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ url: 'https://x/y', mime_type: 'image/jpeg' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => String(6 * 1024 * 1024) },
          arrayBuffer,
        });

      const result = await service.downloadMedia('media_123');

      expect(result).toEqual({ ok: false, reason: 'too-large' });
      // O ponto é não trazer 6 MB para memória só para descartar.
      expect(arrayBuffer).not.toHaveBeenCalled();
    });

    // A distinção que importa: falha de validação é definitiva e vira
    // conteúdo inválido; falha transitória tem que estourar, porque o erro
    // devolve a reivindicação do wamid e a reentrega da Meta é outra chance.
    it('throws on a transient failure instead of discarding the photo', async () => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      await expect(service.downloadMedia('media_123')).rejects.toThrow();
    });

    it('throws when the download of the bytes fails', async () => {
      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            url: 'https://x/y',
            mime_type: 'image/jpeg',
            file_size: 9,
          }),
        })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(service.downloadMedia('media_123')).rejects.toThrow();
    });
  });

  describe('uploadMedia()', () => {
    it('posts the file as multipart and returns the id Meta assigns', async () => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'media_out_1' }) });

      const id = await service.uploadMedia(Buffer.from('bytes'), 'image/png');

      expect(id).toBe('media_out_1');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://graph.facebook.com/v20.0/1234567890/media');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Authorization: 'Bearer test-token' });
      // Sem Content-Type à mão: o fetch tem que montar o boundary sozinho.
      expect(init.body).toBeInstanceOf(FormData);
      expect(init.body.get('messaging_product')).toBe('whatsapp');
      expect(init.body.get('type')).toBe('image/png');
    });

    it('throws when Meta rejects the upload', async () => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'file too big' } }),
      });

      await expect(
        service.uploadMedia(Buffer.from('bytes'), 'image/png'),
      ).rejects.toThrow('file too big');
    });
  });

  describe('sendImage()', () => {
    it('sends the image by id and returns its wamid', async () => {
      const result = await service.sendImage('5521999999999', 'media_out_1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.facebook.com/v20.0/1234567890/messages',
        expect.objectContaining({
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: '5521999999999',
            type: 'image',
            image: { id: 'media_out_1' },
          }),
        }),
      );
      expect(result).toEqual({ whatsappMessageId: 'wamid.HHBHYjkTest' });
    });

    it('carries the caption when there is one', async () => {
      await service.sendImage('5521999999999', 'media_out_1', 'o vaso novo');

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body).image).toEqual({
        id: 'media_out_1',
        caption: 'o vaso novo',
      });
    });

    it('quotes a message when asked, the same way sendText does', async () => {
      await service.sendImage('5521999999999', 'media_out_1', undefined, {
        replyToWamid: 'wamid.original',
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body).context).toEqual({
        message_id: 'wamid.original',
      });
    });
  });
});
