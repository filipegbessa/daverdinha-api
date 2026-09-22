import { CepLookupService } from './cep-lookup.service';

describe('CepLookupService', () => {
  let service: CepLookupService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new CepLookupService();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('returns the neighborhood when the API responds with 200 and a neighborhood field', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ cep: '22041011', neighborhood: 'Copacabana' }),
    });

    const result = await service.lookup('22041011');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://brasilapi.com.br/api/cep/v2/22041011',
      { signal: expect.any(AbortSignal) },
    );
    expect(result).toEqual({ bairro: 'Copacabana' });
  });

  it('returns null when the API responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });

    const result = await service.lookup('00000000');

    expect(result).toBeNull();
  });

  it('returns null when the API response has no neighborhood field', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cep: '22041011' }),
    });

    const result = await service.lookup('22041011');

    expect(result).toBeNull();
  });

  it('returns null when the fetch call itself throws (network failure)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await service.lookup('22041011');

    expect(result).toBeNull();
  });

  // Sem isto, uma BrasilAPI pendurada segurava o webhook inteiro: a Meta não
  // recebia o 200 dentro da janela dela e reentregava a mensagem.
  it('aborts instead of hanging when the API does not answer', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'TimeoutError')),
          );
        }),
    );

    const result = await service.lookup('22041011');

    expect(result).toBeNull();
  });

  it('gives the request a deadline rather than waiting forever', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ neighborhood: 'Tijuca' }),
    });

    await service.lookup('20520000');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
  });
});
