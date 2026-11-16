import { formatOrderCode } from '../../site-orders/order-code';
import { toMoney } from '../../common/money';
import type { SiteOrderRow } from '../../site-orders/site-order-views';
import type { OutgoingEmail } from '../email.service';
import type { PickupInfo } from './order-confirmation';
import { emailButton, emailLayout, escapeHtml, formatBrl } from './layout';

/**
 * Os e-mails de andamento, depois da confirmação: pedido pronto (retirada ou
 * entrega), cancelado e estornado. Curtos, com o link do pedido; os detalhes
 * do pagamento continuam no recibo do Pagar.me.
 */
function parts(order: SiteOrderRow, siteUrl: string) {
  return {
    code: formatOrderCode(order.number),
    link: `${siteUrl}/pedido/${order.publicToken}`,
    firstName: order.customerName.trim().split(/\s+/)[0],
    paidSomething: toMoney(order.total) > 0,
  };
}

function compose(
  order: SiteOrderRow,
  subject: string,
  heading: string,
  paragraphs: string[],
  link: string,
  buttonLabel: string,
): OutgoingEmail {
  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:24px">${escapeHtml(heading)}</h1>
    ${paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n    ')}
    ${emailButton(link, buttonLabel)}
  `);
  const text = [heading, '', ...paragraphs, '', `${buttonLabel}: ${link}`].join(
    '\n',
  );
  return { to: order.customerEmail, subject, html, text };
}

/** O preparo virou "pronto": retirar no ateliê ou saiu pra entrega. */
export function orderReadyEmail(
  order: SiteOrderRow,
  pickup: PickupInfo,
  siteUrl: string,
): OutgoingEmail {
  const { code, link, firstName } = parts(order, siteUrl);
  if (order.deliveryMethod === 'pickup') {
    const where = [
      pickup.pickupAddress,
      pickup.pickupHours,
      pickup.pickupInstructions,
    ]
      .filter(Boolean)
      .join('\n');
    return compose(
      order,
      `Pedido ${code} pronto para retirar · Daverdinha`,
      'Seu pedido está pronto!',
      [
        `Oi, ${firstName}! O pedido ${code} já pode ser retirado no ateliê.`,
        where,
        `Na retirada, é só dizer o código do pedido: ${code}.`,
      ],
      link,
      'Ver meu pedido',
    );
  }
  return compose(
    order,
    `Pedido ${code} saiu para entrega · Daverdinha`,
    'Seu pedido saiu para entrega!',
    [
      `Oi, ${firstName}! O pedido ${code} está a caminho${order.bairro ? ` de ${order.bairro}` : ''}.`,
      'Se precisar combinar algo com quem vai entregar, é só responder este e-mail ou chamar a gente no WhatsApp.',
    ],
    link,
    'Ver meu pedido',
  );
}

/** A loja cancelou um pedido pago (o estorno é feito à parte, no Pagar.me). */
export function orderCancelledEmail(
  order: SiteOrderRow,
  siteUrl: string,
): OutgoingEmail {
  const { code, link, firstName, paidSomething } = parts(order, siteUrl);
  const tickets = order.kind === 'tickets';
  const what = tickets
    ? paidSomething
      ? `os ingressos do pedido ${code}${order.event ? ` (${order.event.title})` : ''} foram cancelados`
      : `a inscrição do pedido ${code}${order.event ? ` (${order.event.title})` : ''} foi cancelada`
    : `o pedido ${code} foi cancelado`;
  return compose(
    order,
    `Pedido ${code} cancelado · Daverdinha`,
    tickets && !paidSomething ? 'Inscrição cancelada' : 'Pedido cancelado',
    [
      `Oi, ${firstName}. Avisamos que ${what}.`,
      ...(paidSomething
        ? [
            `O valor de ${formatBrl(toMoney(order.total))} volta pelo mesmo meio do pagamento (Pix ou cartão).`,
          ]
        : []),
      'Ficou alguma dúvida? É só responder este e-mail.',
    ],
    link,
    'Ver meu pedido',
  );
}

/** O Pagar.me confirmou o estorno. */
export function orderRefundedEmail(
  order: SiteOrderRow,
  siteUrl: string,
): OutgoingEmail {
  const { code, link, firstName } = parts(order, siteUrl);
  return compose(
    order,
    `Estorno do pedido ${code} · Daverdinha`,
    'Estorno feito',
    [
      `Oi, ${firstName}. O estorno de ${formatBrl(toMoney(order.total))} do pedido ${code} foi feito.`,
      'No Pix, o valor volta pra conta usada no pagamento. No cartão, aparece como crédito na fatura, o que pode levar até duas faturas, dependendo do banco.',
    ],
    link,
    'Ver meu pedido',
  );
}
