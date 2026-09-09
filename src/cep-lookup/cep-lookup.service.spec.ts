import { CepLookupService } from './cep-lookup.service';

describe('CepLookupService', () => {
  let service: CepLookupService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new CepLookupService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('returns the neighborhood when the API responds with 200 and a neighborhood field', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ cep: '22041011', neighborhood: 'Copacabana' }),
    });

    const result = await service.lookup('22041011');

    expect(fetchMock).toHaveBeenCalledWith('https://brasilapi.com.br/api/cep/v2/22041011');
    expect(result).toEqual({ bairro: 'Copacabana' });
  });

  it('returns null when the API responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });

    const result = await service.lookup('00000000');

    expect(result).toBeNull();
  });

  it('returns null when the API response has no neighborhood field', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ cep: '22041011' }) });

    const result = await service.lookup('22041011');

    expect(result).toBeNull();
  });

  it('returns null when the fetch call itself throws (network failure)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await service.lookup('22041011');

    expect(result).toBeNull();
  });
});
