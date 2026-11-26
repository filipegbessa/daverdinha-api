# Configurar as chaves (Pagar.me e Resend)

O código já está pronto: nada muda no código quando as chaves chegarem. Elas
entram como variáveis de ambiente **só na API** (o site não fala com o
Pagar.me nem com o Resend).

**Desde 2026-11-25 (migração Vercel → Hostinger/Coolify, ver
`~/Desktop/projects/host/MIGRACAO.md`):** onde ficam é o painel do **Coolify**
(`http://189.24.14.225:8000` → projeto `daverdinha` → `daverdinha-api` →
Environment Variables → Developer View), não mais o dashboard da Vercel.
Depois de salvar, faça um **Redeploy** (mudar só o *valor* de uma env var já
dispara isso sozinho; mudar `start_command` ou `domains` às vezes precisa de
"Redeploy (without cache)" no painel). Nunca coloque chave no repositório nem
no site.

## Pagar.me

### O que pedir/pegar no painel do Pagar.me

| Variável | De onde vem | Exemplo |
| --- | --- | --- |
| `PAGARME_SECRET_KEY` | Painel → Configurações → Chaves. A **secreta** (`sk_…`); a pública (`pk_…`) não é usada | `sk_test_…` (sandbox) ou `sk_live_…` (produção) |
| `PAGARME_WEBHOOK_USER` | Vocês inventam; é o usuário cadastrado no webhook do painel | `daverdinha-webhook` |
| `PAGARME_WEBHOOK_PASSWORD` | Vocês inventam (senha longa e aleatória); a mesma do webhook no painel | 32+ caracteres |
| `SITE_URL` | Já existe | `https://www.daverdinha.com.br` |

O endereço sai da própria chave. Com `sk_live_…`, tudo vai pra produção
(`api.pagar.me`). Com `sk_test_…`, o Pagar.me divide (testado em 2026-11-19):
o link de pagamento só é criado no sandbox (`sdx-api.pagar.me`; em
`api.pagar.me` dá 401 sem corpo), mas os pedidos e cobranças que ele gera
ficam em `api.pagar.me` (no sandbox, `GET /orders` e `/charges` dão 404). A
API já faz essa divisão sozinha. `PAGARME_API_URL` só é necessária pra forçar
outro endereço em tudo; deixe sem.

Cartões de teste (com `sk_test_…`): final `0010` aprova
(`4000000000000010`), final `0028` recusa (`4000000000000028`); qualquer CVV
de 3 dígitos e validade futura. Lista completa no simulador de cartão da
documentação do Pagar.me. Se o pagamento de teste der "1000 - Não foi
possível efetuar o pagamento", o meio de pagamento não está habilitado no
simulador da Loja de teste: é o suporte do Pagar.me que liga ("simulator").

### Webhook no painel do Pagar.me

Painel → **Configurações → Webhooks** → "+ Criar webhook". (O item
**WEBHOOKS** do menu principal é outro: só mostra o histórico de eventos.) O
webhook vale só para o modo em que foi criado: um na Loja de teste (faixa roxa
no topo) e outro igual na produção quando a chave virar `sk_live_…`.

- **Status:** Ativo.
- **URL:** `https://<domínio da API>/webhooks/pagarme` (em produção hoje,
  `https://api.daverdinha.com.br/webhooks/pagarme`, servido pelo VPS
  Hostinger/Coolify — não mais `daverdinha-api.vercel.app`).
- **Máximo de tentativas:** pode ficar em 3.
- **Habilitar autenticação:** ligado, com "Usuário do Webhook" e "Senha do
  Webhook" iguais a `PAGARME_WEBHOOK_USER` e `PAGARME_WEBHOOK_PASSWORD` na
  Vercel. Sem eles a API recusa todo aviso (401).
- **Eventos** (abra cada grupo pelo "+"; não use "Marcar todos"):
  - PEDIDO: `order.paid`, `order.payment_failed`
  - COBRANÇA: `charge.paid`, `charge.payment_failed`, `charge.refunded`
  - CHARGEBACK: `chargeback.received`

  (`checkout.canceled` pode ficar de fora: o vencimento é controlado pela API.)
- **Confirmar criação → Senha:** é a senha do **login no Dash** de quem está
  cadastrando, não a do webhook.

Pra conferir: faça uma compra de teste e veja no histórico (menu WEBHOOKS) os
eventos com resposta 200. 401 é usuário/senha diferentes dos da Vercel; 404 é
URL errada.

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
2. **Produção.** No Coolify (app `daverdinha-api`), cadastre a `sk_live_…`, o
   usuário e a senha do webhook; Redeploy; cadastre o webhook no painel de
   **produção** do Pagar.me (o de sandbox é outro).
   **Atenção:** confira o valor que está cadastrado agora — na migração pra
   cá, as chaves do tipo "Sensitive" na Vercel não puderam ser recuperadas
   (write-only, nem a API nem `vercel env pull` mostram de novo; foi o caso do
   VAPID, que teve que ser gerado do zero), então é fácil ter ficado alguma
   chave de teste (`sk_test_…`) no lugar da `sk_live_…` sem ninguém perceber
   — é exatamente o que causa o erro genérico "1002" do checkout pra
   compradoras reais, porque o link de pagamento cai no sandbox
   (`checkout-bff-sdx.pagar.me`, que só aceita os cartões de teste listados
   acima).
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
