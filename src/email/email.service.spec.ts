import { Resend } from 'resend';
import { EmailError, EmailService } from './email.service';

jest.mock('resend', () => ({ Resend: jest.fn() }));

describe('EmailService', () => {
  const env = { ...process.env };
  const send = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (Resend as unknown as jest.Mock).mockImplementation(() => ({
      emails: { send },
    }));
    send.mockResolvedValue({ data: { id: 'em_1' }, error: null });
  });

  afterEach(() => {
    process.env = { ...env };
  });

  const email = {
    to: 'maria@exemplo.com',
    subject: 'Pedido DV-0042 confirmado',
    html: '<p>Oi</p>',
    text: 'Oi',
  };

  it('does not send without a key, and says so', async () => {
    delete process.env.RESEND_API_KEY;
    const service = new EmailService();
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});

    expect(service.configured).toBe(false);
    expect(await service.send(email)).toBe(false);
    expect(Resend).not.toHaveBeenCalled();
  });

  it('sends from and replies to contato@ by default, with inline images', async () => {
    process.env.RESEND_API_KEY = 're_test';
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;
    const service = new EmailService();

    const qr = Buffer.from('png');
    expect(
      await service.send({
        ...email,
        images: [{ contentId: 'qr-1', filename: 'ingresso.png', content: qr }],
      }),
    ).toBe(true);

    expect(send).toHaveBeenCalledWith({
      from: 'Daverdinha <contato@daverdinha.com.br>',
      replyTo: 'Daverdinha <contato@daverdinha.com.br>',
      to: 'maria@exemplo.com',
      subject: 'Pedido DV-0042 confirmado',
      html: '<p>Oi</p>',
      text: 'Oi',
      attachments: [
        { filename: 'ingresso.png', content: qr, contentId: 'qr-1' },
      ],
    });
  });

  it('turns a Resend error into an EmailError', async () => {
    process.env.RESEND_API_KEY = 're_test';
    send.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'bad from' },
    });
    const service = new EmailService();

    await expect(service.send(email)).rejects.toThrow(EmailError);
  });
});
