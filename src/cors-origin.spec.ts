import { createCorsOriginHandler } from './cors-origin';

describe('createCorsOriginHandler', () => {
  it('allows a request with no Origin header (e.g. server-to-server, curl)', () => {
    const handler = createCorsOriginHandler('https://daverdinha.com.br');
    const callback = jest.fn();

    handler(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows an origin that matches one of several comma-separated allowed origins', () => {
    const handler = createCorsOriginHandler('https://daverdinha.com.br,https://www.daverdinha.com.br');
    const callback = jest.fn();

    handler('https://www.daverdinha.com.br', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rejects an origin not in the allowed list', () => {
    const handler = createCorsOriginHandler('https://daverdinha.com.br,https://www.daverdinha.com.br');
    const callback = jest.fn();

    handler('https://evil.example.com', callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
    expect(callback.mock.calls[0][1]).toBeUndefined();
  });

  it('defaults to localhost:3000 when FRONTEND_URL is undefined', () => {
    const handler = createCorsOriginHandler(undefined);
    const callback = jest.fn();

    handler('http://localhost:3000', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('trims whitespace around comma-separated origins', () => {
    const handler = createCorsOriginHandler('https://daverdinha.com.br, https://www.daverdinha.com.br');
    const callback = jest.fn();

    handler('https://www.daverdinha.com.br', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });
});
