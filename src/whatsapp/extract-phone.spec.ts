import { extractPhoneFromWebhookPayload } from './extract-phone';

describe('extractPhoneFromWebhookPayload', () => {
  it('extracts the sender phone from a well-formed webhook payload', () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ from: '5521999999999' }] } }] }],
    };

    expect(extractPhoneFromWebhookPayload(payload)).toBe('5521999999999');
  });

  it('returns null when the payload has no messages (e.g. a status update webhook)', () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1' }] } }] }] };

    expect(extractPhoneFromWebhookPayload(payload)).toBeNull();
  });

  it('returns null for a malformed payload', () => {
    expect(extractPhoneFromWebhookPayload({})).toBeNull();
    expect(extractPhoneFromWebhookPayload(null)).toBeNull();
  });
});
