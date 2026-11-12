import { isValidWebhookAuth } from './webhook-auth';

const basic = (value: string) =>
  `Basic ${Buffer.from(value).toString('base64')}`;

describe('isValidWebhookAuth', () => {
  it('accepts the configured user and password', () => {
    expect(isValidWebhookAuth(basic('hook:s3cr3t'), 'hook', 's3cr3t')).toBe(
      true,
    );
  });

  it('refuses a wrong password, a missing header or a malformed one', () => {
    expect(isValidWebhookAuth(basic('hook:wrong'), 'hook', 's3cr3t')).toBe(
      false,
    );
    expect(isValidWebhookAuth(undefined, 'hook', 's3cr3t')).toBe(false);
    expect(isValidWebhookAuth('Bearer abc', 'hook', 's3cr3t')).toBe(false);
    expect(isValidWebhookAuth('Basic', 'hook', 's3cr3t')).toBe(false);
  });

  it('never accepts anything when the credentials are not configured', () => {
    expect(isValidWebhookAuth(basic(':'), '', '')).toBe(false);
    expect(isValidWebhookAuth(basic('hook:'), 'hook', '')).toBe(false);
  });
});
