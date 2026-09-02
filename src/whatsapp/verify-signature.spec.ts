import * as crypto from 'crypto';
import { verifySignature } from './verify-signature';

describe('verifySignature', () => {
  const secret = 'test-app-secret';
  const rawBody = Buffer.from(JSON.stringify({ hello: 'world' }));

  function sign(body: Buffer, key: string): string {
    return (
      'sha256=' + crypto.createHmac('sha256', key).update(body).digest('hex')
    );
  }

  it('returns true for a valid signature', () => {
    const signature = sign(rawBody, secret);
    expect(verifySignature(rawBody, signature, secret)).toBe(true);
  });

  it('returns false for a signature signed with the wrong secret', () => {
    const signature = sign(rawBody, 'wrong-secret');
    expect(verifySignature(rawBody, signature, secret)).toBe(false);
  });

  it('returns false when the header is missing', () => {
    expect(verifySignature(rawBody, undefined, secret)).toBe(false);
  });

  it('returns false when the body was tampered with after signing', () => {
    const signature = sign(rawBody, secret);
    const tamperedBody = Buffer.from(JSON.stringify({ hello: 'tampered' }));
    expect(verifySignature(tamperedBody, signature, secret)).toBe(false);
  });
});
