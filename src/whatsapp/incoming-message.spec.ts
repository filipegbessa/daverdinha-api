import { parseIncomingMessage, parseMessageStatuses } from './incoming-message';

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

  it('extracts the audio id and the voice flag', () => {
    const result = parseIncomingMessage({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid_audio',
                    from: '5521999999999',
                    type: 'audio',
                    audio: {
                      id: 'media_456',
                      mime_type: 'audio/ogg; codecs=opus',
                      voice: true,
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result?.type).toBe('audio');
    expect(result?.audio).toEqual({
      id: 'media_456',
      mime_type: 'audio/ogg; codecs=opus',
      voice: true,
    });
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

describe('parseMessageStatuses', () => {
  it('returns an empty array when the payload has no statuses', () => {
    expect(parseMessageStatuses({ entry: [{ changes: [{ value: {} }] }] })).toEqual([]);
    expect(parseMessageStatuses({ some: 'random' })).toEqual([]);
  });

  it('parses a delivered status', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: 'wamid_out_1', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    };

    expect(parseMessageStatuses(payload)).toEqual([
      { wamid: 'wamid_out_1', status: 'delivered', errors: undefined },
    ]);
  });

  it('parses a failed status with its error details', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid_out_2',
                    status: 'failed',
                    errors: [
                      {
                        code: 131053,
                        title: 'Media upload error',
                        message: 'Media upload error',
                        error_data: { details: 'Unsupported media type' },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(parseMessageStatuses(payload)).toEqual([
      {
        wamid: 'wamid_out_2',
        status: 'failed',
        errors: [
          {
            code: 131053,
            title: 'Media upload error',
            message: 'Media upload error',
            details: 'Unsupported media type',
          },
        ],
      },
    ]);
  });

  it('skips entries missing an id or a status', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ status: 'sent' }, { id: 'wamid_out_3' }],
              },
            },
          ],
        },
      ],
    };

    expect(parseMessageStatuses(payload)).toEqual([]);
  });
});
