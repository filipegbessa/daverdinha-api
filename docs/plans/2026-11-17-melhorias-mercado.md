# Melhorias inspiradas no mercado (loja e admin)

**Status:** análise, nada implementado (2026-11-17).

**O que é:** a comparação da nossa loja e do nosso admin com o que Shopify, Nuvemshop, WooCommerce e Loja Integrada oferecem, filtrada para o que faz sentido para uma loja pequena de plantas, que vende também pelo WhatsApp e entrega com equipe própria.

**Outros documentos deste ciclo:**

- `2026-11-17-ajustes-admin-site.md`: os ajustes pedidos (checkout, menu, WhatsApp bot, entregas, Eventos).
- `2026-11-17-melhorias-loja-benchmark.md`: a tela de produto, o preço promocional, o cupom, o frete grátis e o backlog de configuração.

Os itens que já estão nesses dois documentos aparecem aqui só como referência (→ *outro doc*), para não haver duas versões do mesmo plano.

**Legenda:**

- **Impacto:** Alto / Médio / Baixo, na venda ou no trabalho da cliente.
- **Esforço:** P (até 1 dia), M (2–4 dias), G (1 semana ou mais).
- **Ref.:** onde o recurso é padrão.

## 1. O que já temos (não entra como melhoria)

Feito o inventário no código em 2026-11-17, para não propor o que já existe:

- **Vitrine:**
  - categorias paginadas;
  - página de produto com dados estruturados (JSON-LD de produto e breadcrumb);
  - "Entregamos no seu CEP?" na página do produto, com o valor da entrega;
  - produtos em destaque;
  - sitemap.
- **Carrinho e checkout:**
  - carrinho salvo no navegador;
  - endereço preenchido pelo CEP;
  - entrega ou retirada;
  - parcelas sem juros;
  - preço, estoque e frete sempre recalculados na API.
- **Pagamento:** link do Pagar.me (cartão e Pix), webhook, e consulta automática quando o webhook atrasa.
- **Pós-venda:**
  - página do pedido por link;
  - "Meus pedidos" por e-mail;
  - e-mails de confirmação, pronto, cancelado e estorno;
  - ingresso com QR e check-in pela câmera.
- **Medição:** GA4 com `add_to_cart`, `begin_checkout` (ingressos) e `purchase`.
- **Admin:**
  - pedidos com busca e filtros (status, tipo), preparação, cancelamento e reenvio de confirmação;
  - produtos e categorias;
  - áreas de entrega com valor;
  - retirada e parcelas;
  - interruptores do site, da loja e dos ingressos;
  - push de conversa nova.
- **Políticas:** privacidade, trocas e devoluções, entrega e retirada.

## 2. Vitrine (o que a compradora vê)

| # | Melhoria | Por quê | Ref. | Impacto | Esforço |
|---|---|---|---|---|---|
| V1 | **Busca de produtos** no topo do site, com sugestões enquanto digita | Hoje só se navega por categoria. Quem chega procurando "costela-de-adão" não acha. | Todas | Alto | M |
| V2 | **Ordenar e filtrar na categoria** (menor preço, novidades, pronta entrega × sob encomenda) | Padrão de qualquer loja. Ajuda quando a categoria passa de uma página. | Todas | Médio | P |
| V3 | **"Últimas unidades"** quando o estoque é baixo, e selo **"Sob encomenda · X dias"** no card | Urgência e clareza do prazo antes de abrir o produto. | Nuvemshop, Shopify (tema) | Médio | P |
| V4 | **Produtos relacionados** na página do produto ("Combina com": vaso + planta, da mesma categoria) | Aumenta o ticket médio. Começa simples, só pela mesma categoria. | Todas | Médio | P |
| V5 | **Galeria com zoom e tela cheia** no celular | Planta se compra pela foto. | Todas (tema) | Médio | P |
| V6 | **Botão "Dúvida sobre este produto?"** que abre o WhatsApp já com o nome e o link do produto | O canal forte da cliente é o WhatsApp. Junta site e bot. | Nuvemshop (app), Loja Integrada | Alto | P |
| V7 | **Avaliações de clientes** (pedidas por e-mail depois da entrega) | Prova social. Precisa de moderação e de volume para valer a pena. | Shopify e Nuvemshop (apps) | Médio | G |
| V8 | **Preço "de/por" e selo de desconto** | → *outro doc* (Fase A) | | | |
| V9 | **Barra "Faltam R$ X para frete grátis"** | → *outro doc* (Fase C) | | | |

## 3. Checkout e conversão

| # | Melhoria | Por quê | Ref. | Impacto | Esforço |
|---|---|---|---|---|---|
| C1 | **Lembrar os dados da compradora** no navegador (nome, e-mail, telefone, endereço), com "Não sou eu" para limpar | A segunda compra fica com um clique. Sem conta nem senha, coerente com a decisão do pós-venda. | Shopify (Shop Pay), Nuvemshop | Médio | P |
| C2 | **`begin_checkout` e `view_item` no GA4 também na loja** (hoje o `begin_checkout` só existe nos ingressos) | Sem isso não dá para medir onde a compradora desiste. | GA4 e-commerce | Médio | P |
| C3 | **Pixel da Meta** (eventos de visualização, carrinho e compra) | Necessário para anunciar no Instagram com medição de venda. | Todas (integração nativa) | Médio | P |
| C4 | **Checkout transparente** (cartão e Pix na nossa página, sem ir ao link do Pagar.me) | Converte mais que redirecionar. Em troca: tokenização do cartão no front, 3DS e mais telas para manter. **Só depois** que a loja tiver volume e o link estiver rodando. | Nuvemshop, Shopify | Alto | G |
| C5 | **Pedido mínimo** (valor mínimo para entrega) | Protege a margem das entregas próprias. | Nuvemshop, Loja Integrada | Baixo | P |
| C6 | **Agendamento da entrega e mensagem de presente** | → *outro doc* (Fase E) | | | |
| C7 | **Cupom e desconto no Pix** | → *outro doc* (Fases B e C) | | | |

## 4. Pós-venda

| # | Melhoria | Por quê | Ref. | Impacto | Esforço |
|---|---|---|---|---|---|
| P1 | **Linha do tempo do pedido** na página `/pedido/<token>` (Recebido → Pago → Em preparo → Pronto/Saiu para entrega → Entregue) | A compradora entende onde está o pedido sem perguntar no WhatsApp. Os status já existem; falta mostrar. | Shopify (status page), Nuvemshop | Alto | P |
| P2 | **"Comprar de novo"** na página do pedido (põe os mesmos itens no carrinho) | Planta e vaso têm recompra (presente, coleção). | Shopify | Baixo | P |
| P3 | **Pedir avaliação por e-mail** alguns dias depois da entrega | Base para V7. Depende do Resend. | Todas (apps) | Baixo | M |
| P4 | **Aviso de status pelo WhatsApp** | Hoje é só por e-mail (decisão de 2026-11-12). Reabrir quando o bot estiver estável: é o canal que a compradora mais lê. | Nuvemshop (apps) | Alto | M |
| P5 | **Carrinho abandonado e "Avise-me quando chegar"** | → *outro doc* (Fase E) | | | |

## 5. Admin: pedidos e operação

| # | Melhoria | Por quê | Ref. | Impacto | Esforço |
|---|---|---|---|---|---|
| A1 | **Notificação de pedido novo** (push no celular, como já existe para conversa nova, com som diferente) | A cliente fica sabendo da venda na hora, sem abrir o admin. Reaproveita toda a infraestrutura de push. | Shopify (app), Nuvemshop (app) | Alto | P |
| A2 | **Criar pedido pelo admin e gerar o link de pagamento** para mandar no WhatsApp | A cliente já vende pelo WhatsApp. Com isso a venda fechada na conversa vira pedido com pagamento, estoque e e-mail, igual ao do site. Reaproveita o fluxo de checkout. | Shopify (pedidos em rascunho), Nuvemshop (pedido manual) | Alto | M |
| A3 | **Imprimir o pedido** (comanda de separação e etiqueta de entrega com endereço, telefone e observações) | Entrega própria: o entregador sai com o papel. CSS de impressão, sem PDF. | Todas | Médio | P |
| A4 | **Entregas do dia**: lista dos pedidos a entregar agrupados por área ou bairro, com link do endereço no Maps | Monta a rota da entrega própria. Usa as áreas de entrega que já existem. | Apps de logística | Médio | M |
| A5 | **Histórico do pedido** (linha do tempo no admin: criado, pago, e-mail enviado, status alterado por quem e quando) + **nota interna** | Responde "o que aconteceu com esse pedido?" sem olhar o log. | Shopify, Nuvemshop | Médio | M |
| A6 | **Exportar pedidos em CSV** (por período) | Contabilidade e conferência com o extrato do Pagar.me. | Todas | Médio | P |
| A7 | **Quadro por etapa de preparo** (colunas A preparar / Pronto / Entregue) | Visual de cozinha para quem prepara sob encomenda. Opcional: a lista com filtro já resolve boa parte. | Apps de pedidos | Baixo | M |

## 6. Admin: catálogo

| # | Melhoria | Por quê | Ref. | Impacto | Esforço |
|---|---|---|---|---|---|
| K1 | **Tela própria de produto, rascunho, duplicar, edição de preço em massa, variações** | → *outro doc* (Fases 0 e E) | | | |
| K2 | **Alerta de estoque baixo** (limite por produto ou global; aviso no Dashboard e na lista) | Evita "esgotado" sem perceber. | Shopify, Nuvemshop | Médio | P |
| K3 | **Reordenar arrastando** produtos e categorias (o campo `order` já existe) | Hoje a ordem é um número a digitar. | Shopify (coleções), Nuvemshop | Baixo | P |
| K4 | **Importar e exportar produtos por planilha** | Útil no cadastro inicial e na revisão de preços. Com poucos produtos, pode esperar. | Todas | Baixo | M |

## 7. Admin: clientes

| # | Melhoria | Por quê | Ref. | Impacto | Esforço |
|---|---|---|---|---|---|
| L1 | **Lista de clientes** derivada dos pedidos (por e-mail): nº de pedidos, total gasto, última compra, pedidos | "Quem são minhas melhores clientes?" Base para cupom de recompra. Sem conta da compradora. | Shopify, Nuvemshop | Médio | M |
| L2 | **Ligar a cliente à conversa do WhatsApp** pelo telefone (na conversa, "Pedidos desta cliente"; no pedido, "Abrir conversa") | O atendimento vê o histórico de compras sem perguntar. Diferencial nosso: as plataformas não têm o bot. | — | Alto | M |

**LGPD:** a lista de clientes só reorganiza dados que já guardamos nos pedidos. Atualizar a política de privacidade se passarmos a usar esses dados para marketing (P3, cupons de recompra).

## 8. Marketing e canais

| # | Melhoria | Por quê | Ref. | Impacto | Esforço |
|---|---|---|---|---|---|
| M1 | **Feed de produtos** (XML/CSV em uma URL pública) para o **Google Merchant Center** e o **catálogo da Meta** (Instagram Shopping e catálogo do WhatsApp) | Produtos aparecem no Google Shopping e no Instagram e ficam sempre em dia com o site. Pode substituir a manutenção manual do catálogo do WhatsApp que o bot usa. | Todas (nativo ou app) | Alto | M |
| M2 | **Cupom, frete grátis, link com cupom** | → *outro doc* (Fases B e C) | | | |
| M3 | **Captura de e-mail** (newsletter, com cupom de primeira compra) | Base para campanhas. Só faz sentido com cupom e Resend prontos. | Todas | Baixo | P |

## 9. Dashboard e relatórios

| # | Melhoria | Por quê | Ref. | Impacto | Esforço |
|---|---|---|---|---|---|
| R1 | **Resumo de vendas no Dashboard**: vendas e nº de pedidos de hoje, 7 e 30 dias; ticket médio; **pedidos a preparar** (atalho); mais vendidos | Hoje o Dashboard só tem interruptores. A Shopify abre no resumo do dia. Tudo sai das tabelas de pedidos. | Shopify, Nuvemshop | Alto | M |
| R2 | **Guia de configuração** (checklist) | → *outro doc* (Fase E) | | | |
| R3 | **Funil do GA4 no Dashboard** (visitas → carrinho → checkout → compra) | Depende do C2. Pode ficar no próprio GA no começo. | Shopify | Baixo | M |

## 10. Configuração da loja

| # | Melhoria | Por quê | Ref. | Impacto | Esforço |
|---|---|---|---|---|---|
| S1 | **Loja em pausa / férias** com mensagem e data de volta (o site mostra o aviso, o carrinho não fecha pedido) | Hoje desligar a loja vira "compre pelo WhatsApp", sem explicar. Útil em feriados e viagens. | Nuvemshop, Loja Integrada | Médio | P |
| S2 | **Capacidade por dia** para pedidos sob encomenda (máximo de pedidos por dia; o prazo cresce quando lota) | Protege a produção artesanal de prometer prazo que não cabe. | Apps de agendamento | Médio | M |
| S3 | **Horário de corte** ("pedidos até 14h saem no mesmo dia") | Expectativa clara de entrega, junto com o agendamento (C6). | Nuvemshop (frete), apps | Médio | P |

## 11. Sugestão de prioridade (só deste documento)

**Primeiro, rápidos e de alto impacto:**

| Item | O que é |
|---|---|
| A1 | Push de pedido novo |
| P1 | Linha do tempo do pedido |
| V6 | WhatsApp na página do produto |
| C1 | Lembrar a compradora |
| C2 | Eventos do GA4 |
| A3 | Imprimir pedido |
| K2 | Estoque baixo |
| S1 | Loja em férias |

**Em seguida, os de impacto alto e esforço médio:**

| Item | O que é |
|---|---|
| A2 | Pedido pelo admin com link de pagamento |
| R1 | Resumo de vendas |
| V1 | Busca |
| M1 | Feed para Google e Meta |
| L2 | Cliente ↔ conversa |

**Mais tarde:**

| Item | O que é |
|---|---|
| C4 | Checkout transparente |
| V7 / P3 | Avaliações |
| P4 | Status pelo WhatsApp |
| S2 | Capacidade por dia |
| A4 / A7 | Entregas do dia e quadro de preparo |
| L1 | Lista de clientes |
| K4 | Planilha de produtos |

A ordem de implementação junto com os outros dois documentos está em `2026-11-17-ajustes-admin-site.md`, seção "Roteiro de implementação".

## Fontes

- [Polaris, padrão "resource details"](https://polaris.shopify.com/patterns/resource-details-layout)
- [Nuvemshop, como cadastrar um produto](https://atendimento.nuvemshop.com.br/adicionar-um-novo-produto/como-cadastrar-um-produto)
- [Nuvemshop, cadastro avançado](https://atendimento.nuvemshop.com.br/adicionar-um-novo-produto/como-cadastrar-um-produto-avancado)

Os demais recursos citados como "padrão" vêm do conhecimento geral das plataformas, sem nova pesquisa. Conferir em demonstração antes de copiar um detalhe específico.
