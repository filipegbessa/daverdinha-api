export function extractPhoneFromWebhookPayload(payload: unknown): string | null {
  const from = (payload as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
  return typeof from === 'string' ? from : null;
}
