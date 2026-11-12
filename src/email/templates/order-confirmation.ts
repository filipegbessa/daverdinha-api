import * as QRCode from 'qrcode';
import { formatOrderCode } from '../../site-orders/order-code';
import { toMoney } from '../../common/money';
import type { SiteOrderRow } from '../../site-orders/site-order-views';
import type { OutgoingEmail } from '../email.service';
import { emailLayout, escapeHtml, formatBrl, formatEventDate } from './layout';

/** O que a retirada mostra, das configurações da loja na hora do envio. */
export interface PickupInfo {
  pickupAddress: string;
  pickupHours: string;
  pickupInstructions: string | null;
}

/**
 * O e-mail de "pedido confirmado". Fala do pedido (o que foi comprado,
 * entrega ou retirada, ingressos com QR) e manda pro link; os dados do
 * pagamento ficam no recibo do Pagar.me (decisão 7 do plano de pós-venda).
 */
export async function orderConfirmationEmail(
  order: SiteOrderRow,
  pickup: PickupInfo,
  siteUrl: string,
): Promise<OutgoingEmail> {
  const code = formatOrderCode(order.number);
  const link = `${siteUrl}/pedido/${order.publicToken}`;
  const firstName = order.customerName.trim().split(/\s+/)[0];
  return order.kind === 'tickets'
    ? ticketsEmail(order, code, link, firstName)
    : productsEmail(order, code, link, firstName, pickup);
}

async function ticketsEmail(
  order: SiteOrderRow,
  code: string,
  link: string,
  firstName: string,
): Promise<OutgoingEmail> {
  const event = order.event;
  const free = toMoney(order.total) === 0;
  const title = event?.title ?? 'evento';
  const when = event ? formatEventDate(event.startsAt, event.endsAt) : '';
  const where = event?.locationName
    ? [event.locationName, event.locationAddress].filter(Boolean).join(' · ')
    : 'No ateliê da Daverdinha';

  const images = await Promise.all(
    order.tickets.map(async (ticket, index) => ({
      contentId: `ingresso-${index + 1}`,
      filename: `ingresso-${ticket.code}.png`,
      content: await QRCode.toBuffer(ticket.code, { width: 240, margin: 1 }),
    })),
  );

  const tickets = order.tickets
    .map(
      (ticket, index) => `
      <tr><td style="padding:16px;border:1px solid #e6dfd3;border-radius:12px;text-align:center">
        <p style="margin:0 0 8px;font-weight:600">${escapeHtml(ticket.attendeeName)}</p>
        <img src="cid:ingresso-${index + 1}" width="160" height="160" alt="QR do ingresso ${escapeHtml(ticket.code)}" style="display:block;margin:0 auto">
        <p style="margin:8px 0 0;font-family:monospace;letter-spacing:2px">${escapeHtml(ticket.code)}</p>
      </td></tr><tr><td style="height:12px"></td></tr>`,
    )
    .join('');

  const heading = free ? 'Inscrição confirmada!' : 'Ingresso confirmado!';
  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:24px">${heading}</h1>
    <p>Oi, ${escapeHtml(firstName)}! Está tudo certo com o pedido <strong>${code}</strong>.</p>
    <p style="margin:16px 0 4px;font-size:18px;font-weight:600">${escapeHtml(title)}</p>
    <p style="margin:0">${escapeHtml(when)}</p>
    <p style="margin:0 0 16px">${escapeHtml(where)}</p>
    <p>Mostre o QR de cada pessoa na entrada:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tickets}</table>
    ${button(link, 'Ver meus ingressos')}
  `);
  const text = [
    `${heading} Pedido ${code}.`,
    '',
    title,
    when,
    where,
    '',
    'Participantes (mostre o QR na entrada):',
    ...order.tickets.map((t) => `- ${t.attendeeName}: ${t.code}`),
    '',
    `Seus ingressos: ${link}`,
  ].join('\n');
  return {
    to: order.customerEmail,
    subject: `${heading} ${title} · ${code}`,
    html,
    text,
    images,
  };
}

function productsEmail(
  order: SiteOrderRow,
  code: string,
  link: string,
  firstName: string,
  pickup: PickupInfo,
): OutgoingEmail {
  const items = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:6px 0">${item.quantity} × ${escapeHtml(item.productName)}${
          item.leadTimeDays
            ? `<br><span style="color:#6b6257;font-size:13px">Sob encomenda · até ${item.leadTimeDays} dias</span>`
            : ''
        }</td>
        <td style="padding:6px 0;text-align:right;white-space:nowrap">${formatBrl(toMoney(item.unitPrice) * item.quantity)}</td>
      </tr>`,
    )
    .join('');
  const delivery =
    order.deliveryMethod === 'pickup'
      ? `<p><strong>Retirada no ateliê</strong><br>${escapeHtml(pickup.pickupAddress)}<br>${escapeHtml(pickup.pickupHours)}${
          pickup.pickupInstructions
            ? `<br>${escapeHtml(pickup.pickupInstructions)}`
            : ''
        }</p><p>Avisamos pelo WhatsApp quando estiver pronto pra retirar.</p>`
      : `<p><strong>Entrega</strong> em ${escapeHtml(order.bairro ?? 'seu endereço')}. Avisamos pelo WhatsApp quando sair pra entrega.</p>`;

  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:24px">Pedido confirmado!</h1>
    <p>Oi, ${escapeHtml(firstName)}! Recebemos o pedido <strong>${code}</strong> e já vamos preparar.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-top:1px solid #e6dfd3;border-bottom:1px solid #e6dfd3">
      ${items}
      <tr><td style="padding:6px 0">Entrega</td><td style="padding:6px 0;text-align:right">${formatBrl(toMoney(order.deliveryFee))}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600">Total</td><td style="padding:6px 0;text-align:right;font-weight:600">${formatBrl(toMoney(order.total))}</td></tr>
    </table>
    ${delivery}
    ${button(link, 'Ver meu pedido')}
  `);
  const text = [
    `Pedido confirmado! ${code}`,
    '',
    ...order.items.map((i) => `${i.quantity} × ${i.productName}`),
    `Total: ${formatBrl(toMoney(order.total))}`,
    '',
    order.deliveryMethod === 'pickup'
      ? `Retirada: ${pickup.pickupAddress} (${pickup.pickupHours})`
      : `Entrega em ${order.bairro ?? 'seu endereço'}`,
    '',
    `Seu pedido: ${link}`,
  ].join('\n');
  return {
    to: order.customerEmail,
    subject: `Pedido ${code} confirmado · Daverdinha`,
    html,
    text,
  };
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#3f5a3a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600">${label}</a></p>`;
}
