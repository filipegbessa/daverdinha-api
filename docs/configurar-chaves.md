# Configurar as chaves (Pagar.me e Resend)

O código já está pronto: nada muda no código quando as chaves chegarem. Elas
entram como variáveis de ambiente **só na API** (o site não fala com o
Pagar.me nem com o Resend).

Onde ficam: Vercel → projeto da **API** → Settings → Environment Variables.
Depois de salvar, faça um **Redeploy** do último deploy (a Vercel só lê
variável nova num deploy novo). Nunca coloque chave no repositório nem no site.

## Pagar.me

### O que pedir/pegar no painel do Pagar.me

| Variável | De onde vem | Exemplo |
| --- | --- | --- |
| `PAGARME_SECRET_KEY` | Painel → Configurações → Chaves. A **secreta** (`sk_…`); a pública (`pk_…`) não é usada | `sk_test_…` (sandbox) ou `sk_live_…` (produção) |
| `PAGARME_WEBHOOK_USER` | Vocês inventam; é o usuário cadastrado no webhook do painel | `daverdinha-webhook` |
| `PAGARME_WEBHOOK_PASSWORD` | Vocês inventam (senha longa e aleatória); a mesma do webhook no painel | 32+ caracteres |
| `SITE_URL` | Já existe | `https://www.daverdinha.com.br` |

O ambiente sai da própria chave: `sk_test_…` usa o sandbox
(`sdx-api.pagar.me`) e `sk_live_…` usa produção (`api.pagar.me`).
`PAGARME_API_URL` só é necessária pra forçar outro endereço; deixe sem.

### Webhook no painel do Pagar.me

Painel → Configurações → Webhooks → novo webhook:

- **URL:** `https://<domínio da API>/webhooks/pagarme`
- **Autenticação:** Basic Auth com o mesmo usuário e senha de
  `PAGARME_WEBHOOK_USER` e `PAGARME_WEBHOOK_PASSWORD`. Sem eles a API recusa
  todo aviso (401).
- **Eventos:** `order.paid`, `order.payment_failed`, `charge.paid`,
  `charge.payment_failed`, `charge.refunded`, `chargeback.received`.
  (`checkout.canceled` pode ficar de fora: o vencimento é controlado pela API.)

Se o webhook falhar ou atrasar, nada se perde: a página do pedido e o admin
consultam o Pagar.me sozinhos (no máximo uma vez por minuto), e o botão
"Atualizar pagamento" no admin força a consulta.

### Ordem sugerida

1. **Sandbox primeiro, fora da produção.** Com a chave `sk_test_…`, rode a API
   e o site localmente (`.env` da API com `PAGARME_SECRET_KEY`) e faça o
   roteiro do sandbox, logo abaixo. Cartão aprovado `4000000000000010`,
   recusado `4000000000000028`, qualquer CVV, validade futura; Pix de teste
   pelo painel. Localmente o webhook não
   chega (o Pagar.me não alcança o seu computador), e tudo bem: a página do
   pedido confirma sozinha.
   Não ponha a chave de teste na produção com a loja ligada: qualquer
   visitante "compraria" com cartão de teste.
2. **Produção.** Na Vercel (ambiente Production), cadastre a `sk_live_…`, o
   usuário e a senha do webhook; Redeploy; cadastre o webhook no painel de
   **produção** do Pagar.me (o de sandbox é outro).
3. **Conferir.** No Dashboard do admin, o aviso "pagamento não configurado"
   some. Ligue "Venda pelo site" (e/ou "Venda de ingressos"), faça uma compra
   real de valor baixo e estorne pelo painel do Pagar.me. O pedido deve
   aparecer pago e depois estornado no admin.

### Roteiro do sandbox

Uma compra de cada tipo, conferindo o pedido no admin e na página `/pedido/<token>`:

1. Produto com cartão aprovado: o pedido fica pago, o estoque baixa e sai o e-mail de confirmação.
2. Cartão recusado: o pedido continua pendente e vence em 1 hora, devolvendo o estoque.
3. Pix: pago pelo painel do sandbox, o pedido vira pago sem clicar em "Já paguei".
4. **Pedido com cupom:** com desconto, o link vai ao Pagar.me como **um item só** (o total já descontado). Conferir que o link mostra esse valor e que o pedido fica pago.
5. Ingresso pago e inscrição gratuita: o e-mail chega com o QR, e o check-in pela câmera funciona.
6. Estorno pelo painel: o pedido vira estornado no admin e sai o e-mail.

**Suposições do código a confirmar nesse teste** (estão isoladas em `src/pagarme/`; se alguma falhar, só esse módulo muda):

1. **Autenticação do webhook = Basic Auth** configurado no painel (`webhook-auth.ts`). Se for assinatura, trocar só essa função.
2. **A cobrança traz `order.code = DV-…`** (o `order_code` do link) ou `order.id`, que é como `applyGatewayCharge` acha o pedido. Se não trouxer nenhum dos dois, o pedido não é achado: fica pendente e vence. Conferir antes de tudo.
3. **Reconciliação por `GET /orders?code=DV-…`** (`findChargesForLink`), porque a documentação não descreve `GET /paymentlinks/:id`.
4. **Estorno = cobrança `canceled` com `paid_at`** (tratado como `refunded`); `overpaid` e `underpaid` contam como pagos e caem na conferência de valor.
5. O sandbox é um só para todos os ambientes: dois bancos (local e homologação) geram `DV-0001` repetido. A conferência de valor segura a maioria dos casos; em homologação, usar uma conta sandbox só dela.

## Alertas (opcional)

| Variável | De onde vem | Padrão se ficar vazia |
| --- | --- | --- |
| `ALERT_EMAIL` | Um e-mail de quem cuida do site | Os alertas saem só pelo push do admin e pelo log |

Quando a venda falha em silêncio (link de pagamento que não sai, valor pago diferente, webhook recusado, e-mail de confirmação que falhou, erro inesperado no checkout), a API avisa pelo push do admin e, com esta variável, por e-mail. Precisa do Resend configurado. Detalhes em "Alertas da venda" no README.

## Resend (e-mails de confirmação e "Meus pedidos")

| Variável | De onde vem | Padrão se ficar vazia |
| --- | --- | --- |
| `RESEND_API_KEY` | resend.com → API Keys (permissão "Sending access") | Nenhum e-mail sai; a API só registra no log |
| `EMAIL_FROM` | Opcional | `Daverdinha <contato@daverdinha.com.br>` |
| `EMAIL_REPLY_TO` | Opcional | O mesmo do remetente |

Antes da chave: no Resend, adicione o domínio `daverdinha.com.br` e cadastre no
DNS os registros que ele mostrar (SPF, DKIM e DMARC). Sem isso o e-mail cai no
spam ou é recusado. Só depois de o Resend marcar o domínio como verificado,
cadastre `RESEND_API_KEY` na Vercel e faça o Redeploy.

Pra conferir: uma inscrição gratuita num evento de teste manda o e-mail com o
QR na hora; o "Meus pedidos" no site manda os links pro mesmo e-mail.
