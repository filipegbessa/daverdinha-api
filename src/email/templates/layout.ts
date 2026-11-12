/**
 * Moldura e utilidades dos e-mails. HTML de tabela e estilo inline, porque é
 * o que os programas de e-mail (Gmail, Outlook) entendem.
 */
const TIME_ZONE = 'America/Sao_Paulo';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** "R$ 45,00", com espaço comum no lugar do espaço fixo. */
export function formatBrl(value: number): string {
  return brl.format(value).replace(/ /g, ' ');
}

/** "sábado, 21/11 · 10h às 12h" no horário do Rio; sem fim, só o começo. */
export function formatEventDate(startsAt: Date, endsAt: Date | null): string {
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  }).format(startsAt);
  const start = `${day} · ${hour(startsAt)}`;
  return endsAt ? `${start} às ${hour(endsAt)}` : start;
}

/** "10h" ou "10h30". */
function hour(date: Date): string {
  const [h, m] = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** "12/11/2026" no horário do Rio. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function emailLayout(body: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f7f3ec;font-family:Arial,Helvetica,sans-serif;color:#2b2621;line-height:1.5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf9;border-radius:16px">
      <tr><td style="padding:28px 24px">
        <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#3f5a3a">Daverdinha</p>
        ${body}
        <p style="margin:32px 0 0;font-size:13px;color:#6b6257">Dúvidas? É só responder este e-mail.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
