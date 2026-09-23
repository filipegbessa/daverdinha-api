import { parseIncomingMessage } from './incoming-message';

describe('parseIncomingMessage', () => {
  it('parses a payload with context.id and extracts repliedToWamid', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid_msg_1',
                    from: '5521999999999',
                    type: 'text',
                    text: { body: 'Thanks!' },
                    context: {
                      id: 'wamid_original_msg',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseIncomingMessage(payload);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('wamid_msg_1');
    expect(result?.from).toBe('5521999999999');
    expect(result?.type).toBe('text');
    expect(result?.text?.body).toBe('Thanks!');
    expect(result?.repliedToWamid).toBe('wamid_original_msg');
  });

  it('returns undefined for repliedToWamid when context is absent', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid_msg_2',
                    from: '5521999999999',
                    type: 'text',
                    text: { body: 'Normal message' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseIncomingMessage(payload);

    expect(result).not.toBeNull();
    expect(result?.repliedToWamid).toBeUndefined();
  });

  it('extracts referredProductId and returns undefined repliedToWamid when context has only referred_product', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid_msg_3',
                    from: '5521999999999',
                    type: 'text',
                    text: { body: 'Interested in this product' },
                    context: {
                      referred_product: {
                        catalog_id: 'cat1',
                        product_retailer_id: 'prod123',
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseIncomingMessage(payload);

    expect(result).not.toBeNull();
    expect(result?.referredProductId).toBe('prod123');
    expect(result?.repliedToWamid).toBeUndefined();
  });

  it('returns null when messages array is empty', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [],
              },
            },
          ],
        },
      ],
    };

    const result = parseIncomingMessage(payload);

    expect(result).toBeNull();
  });

  it('returns null when from is missing', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid_msg_4',
                    type: 'text',
                    text: { body: 'Message without from' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = parseIncomingMessage(payload);

    expect(result).toBeNull();
  });

  it('returns null when entry path does not exist', () => {
    const payload = { some: 'random', data: 'here' };

    const result = parseIncomingMessage(payload);

    expect(result).toBeNull();
  });

  function imagePayload(image: Record<string, unknown>) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid_img',
                    from: '5521999999999',
                    type: 'image',
                    image,
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  it('extracts the image id and metadata, which is all the webhook carries', () => {
    // A foto não vem no webhook: vem um id que ainda precisa ser trocado pelo
    // arquivo em duas chamadas autenticadas.
    const result = parseIncomingMessage(
      imagePayload({ id: 'media_123', mime_type: 'image/jpeg', sha256: 'abc' }),
    );

    expect(result?.type).toBe('image');
    expect(result?.image).toEqual({
      id: 'media_123',
      mime_type: 'image/jpeg',
      sha256: 'abc',
    });
  });

  it('extracts the caption, which lives on the image and not on text', () => {
    const result = parseIncomingMessage(
      imagePayload({ id: 'media_123', caption: 'segue o comprovante' }),
    );

    expect(result?.image?.caption).toBe('segue o comprovante');
    // Decisão 6 do plano: legenda é conteúdo, nunca comando. Mantê-la fora de
    // `text` é o que impede o bot de tratá-la como resposta de CEP ou como a
    // palavra "menu".
    expect(result?.text).toBeUndefined();
  });

  it('leaves image undefined on a message that has none', () => {
    const result = parseIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'w1',
                    from: '5521999999999',
                    type: 'text',
                    text: { body: 'oi' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result?.image).toBeUndefined();
  });
});
