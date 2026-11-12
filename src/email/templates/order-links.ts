import { formatOrderCode } from '../../site-orders/order-code';
import { toMoney } from '../../common/money';
import type { OutgoingEmail } from '../email.service';
import { emailLayout, escapeHtml, formatBrl, formatDate } from './layout';

export interface OrderLink {
  number: number;
  publicToken: string;
  kind: 'products' | 'tickets';
  status: 'pending_payment' | 'paid';
  total: Parameters<typeof toMoney>[0];
  createdAt: Date;
  eventTitle: string | null;
}

/** O e-mail de "Meus pedidos": um link por pedido, o mais recente primeiro. */
export function orderLinksEmail(
  to: string,
  orders: OrderLink[],
  siteUrl: string,
): OutgoingEmail {
  const describe = (order: OrderLink) => {
    const what =
      order.kind === 'tickets'
        ? `Ingressos · ${order.eventTitle ?? 'evento'}`
        : `Produtos · ${formatBrl(toMoney(order.total))}`;
    const status =
      order.status === 'pending_payment' ? ' · aguardando pagamento' : '';
    return `${formatOrderCode(order.number)} · ${formatDate(order.createdAt)} · ${what}${status}`;
  };
  const link = (order: OrderLink) => `${siteUrl}/pedido/${order.publicToken}`;

  const rows = orders
    .map(
      (order) =>
        `<li style="margin:0 0 10px"><a href="${escapeHtml(link(order))}" style="color:#3f5a3a">${escapeHtml(describe(order))}</a></li>`,
    )
    .join('');
  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:24px">Seus pedidos</h1>
    <p>Aqui estão os links dos seus pedidos na Daverdinha. Cada link abre o pedido e, nos eventos, os ingressos com QR.</p>
    <ul style="padding-left:20px">${rows}</ul>
    <p style="font-size:13px;color:#6b6257">Não pediu este e-mail? Pode ignorar: ninguém vê seus pedidos sem estes links.</p>
  `);
  const text = [
    'Seus pedidos na Daverdinha:',
    '',
    ...orders.map((order) => `${describe(order)}\n${link(order)}`),
  ].join('\n');
  return { to, subject: 'Seus pedidos na Daverdinha', html, text };
}
