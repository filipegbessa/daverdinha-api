# Melhorias na configuração da loja: benchmark e plano

**Status:** plano, nada implementado (2026-11-17).

A ordem de implementação (junto com os outros planos do dia) está em `2026-11-17-ajustes-admin-site.md`, seção "Roteiro de implementação".

**Objetivo:** dar à cliente as ferramentas de venda que as plataformas de e-commerce já têm, começando por **preço promocional** e **cupom de desconto**, sem perder o que a nossa loja tem de simples.

## 1. Benchmark

Este quadro é um resumo do que as plataformas mais usadas no Brasil oferecem hoje, a partir da documentação pública e do uso comum delas. Não é uma pesquisa feita agora: antes de fechar o escopo, vale abrir os painéis de demonstração de duas delas, de preferência Nuvemshop e Shopify.

### Preço promocional

| Plataforma | Como funciona |
|---|---|
| **Shopify** | Campo "Comparar com o preço" (*compare-at price*): o preço cobrado é o `price`, e o "de" aparece riscado. Não tem agendamento nativo; o agendamento vem por app. |
| **Nuvemshop** | "Preço" + "Preço promocional" + "Custo". O site mostra "de/por" e o % de desconto. |
| **WooCommerce** | "Preço normal" + "Preço de venda", com **agendamento** (data de início e fim). |
| **Loja Integrada / Tray** | "Preço cheio" + "Preço promocional", com selo de desconto na vitrine. |

**O que se repete em todas:**

- um segundo campo opcional no produto;
- vitrine com "~~R$ 80~~ R$ 64" e um selo "-20%";
- validação "promocional < preço";
- agendamento opcional;
- relatório de margem quando existe o campo de custo.

### Cupom de desconto

| Recurso | Shopify | Nuvemshop | WooCommerce | Loja Integrada |
|---|---|---|---|---|
| % ou valor fixo | ✓ | ✓ | ✓ | ✓ |
| Frete grátis como cupom | ✓ | ✓ | ✓ | ✓ |
| Valor mínimo do pedido | ✓ | ✓ | ✓ | ✓ |
| Validade (início/fim) | ✓ | ✓ | ✓ | ✓ |
| Limite de usos total | ✓ | ✓ | ✓ | ✓ |
| Limite por cliente | ✓ | ✓ | ✓ | parcial |
| Restringir a categorias/produtos | ✓ | ✓ | ✓ | ✓ |
| Não acumular com promoção | ✓ | ✓ | ✓ | ✓ |
| Desconto automático (sem código) | ✓ | ✓ (progressivo) | via plugin | ✓ |

**Recursos típicos do Brasil que valem atenção:**

- **Desconto no Pix** ("5% off no Pix"): muito comum, porque o Pix custa menos para a loja.
- **Frete grátis acima de R$ X**: aumenta o ticket médio e é a promoção mais simples de explicar.
- **Cupom de primeira compra** e cupom divulgado no Instagram e no WhatsApp: a nossa cliente já vende pelo WhatsApp.

### Outras ideias de experiência na configuração (para depois)

- **Guia de configuração no Dashboard** (como o *setup guide* da Shopify), em forma de checklist:
  - pagamento configurado;
  - áreas de entrega com valor;
  - pelo menos um produto;
  - políticas preenchidas;
  - e-mail configurado.

  Hoje esses avisos estão espalhados.
- **Duplicar produto**, **editar preço em massa** e **produto em rascunho**.
- **Variações** (tamanho do vaso, cor), hoje um produto por variação.
- Coisas de floricultura/plantas:
  - **agendamento da entrega** (data e período);
  - **mensagem de presente** no checkout.
- **Carrinho abandonado** por e-mail (depende do Resend) e **"Avise-me quando chegar"**.

## 2. Restrições do nosso projeto

- **Preço sempre do banco.** O checkout recalcula tudo na API (`POST /checkout/quote` e a criação do pedido). Desconto também: o site só manda o **código** do cupom, e a API decide.
- **Link de pagamento do Pagar.me.** Hoje mandamos `cart_settings.items` (preço de cada item) + `shipping_cost`, e o total cobrado é a soma. **Falta verificar na doc ou com o suporte** se `POST /paymentlinks` aceita um campo de desconto.
  - **Se não aceitar:** o desconto é **rateado** no preço dos itens enviados ao Pagar.me, proporcional ao valor de cada um, e a sobra dos centavos vai no último item. O nosso pedido guarda o preço cheio, o desconto e o código do cupom. Só o que vai ao Pagar.me é rateado.
  - **Frete grátis:** é `shipping_cost` zero.
  - **Desconto no Pix:** só dá se o link permitir valor diferente por meio de pagamento. **Verificar.** Se não permitir, fica fora (a alternativa seria criar o pedido Pix pela API de pedidos, fora do link, o que é um projeto maior).
- **Cache do site.** Produto e vitrine são cacheados (ISR). Promoção com data de início e fim precisa:
  - revalidar na virada, por um cron que chama `refreshPublicSite`, ou
  - aceitar alguns minutos de atraso na vitrine.

  O checkout está sempre certo, porque lê do banco.
- **Pedidos com estoque reservado.** Pedido pendente reserva estoque até vencer. Os usos de cupom seguem a mesma lógica: um uso **conta** quando o pedido é pago e **reserva** enquanto o pedido está pendente, para o limite de usos não estourar com vários pedidos abertos ao mesmo tempo.

## 3. Plano em fases

### Fase 0: tela própria de criar e editar produto (antes da Fase A)

Com preço promocional, agendamento e depois SEO e variações, o modal (`ProductDialog`) fica apertado demais. O produto passa a ter uma página própria, e os campos novos das fases seguintes já nascem nela.

#### Benchmark da estrutura da tela (pesquisado em 2026-11-17)

| Referência | Estrutura |
|---|---|
| **Shopify (padrão Polaris "resource details")** | Página de largura padrão (não tela cheia), em **duas colunas**. A principal tem o conteúdo editável. A lateral tem informações de apoio: status, organização, metadados. Conteúdo relacionado fica no mesmo card, e os cards seguem a ordem de importância. Seções da principal: título e descrição → mídia → preço (com "comparar com") → estoque → frete → variações → listagem em buscadores (SEO). Lateral: status (Ativo / Rascunho / Arquivado), canais de venda, organização (categoria, coleções, tags). Barra de salvar fixa quando há alterações. |
| **Nuvemshop** | Uma coluna longa de seções: nome e descrição → fotos e vídeo → preços (original + promocional, com a opção de mostrar o preço na loja) → estoque → códigos (SKU, código de barras) → peso e dimensões (só para o frete) → categoria (obrigatória) → "Tags, marca e SEO" (título, descrição e URL). |
| **WooCommerce** | Título e descrição em cima; um bloco "Dados do produto" com abas (Geral: preço normal, preço de venda e agendamento; Inventário; Entrega; Variações). Lateral com Publicar, Categorias, Tags e Imagem do produto. |

**Padrão que se repete:**

- **Página, não modal.** Tem URL própria (`/produtos/novo` e `/produtos/:id`), dá para abrir em outra aba e ter o link salvo.
- **Coluna principal = o que descreve e vende o produto** (texto, fotos, preço, estoque). **Coluna lateral = estado e organização** (publicado ou não, categoria, destaque).
- **Cards por assunto**, cada um com título, na ordem em que a pessoa pensa no produto.
- **Salvar sempre à mão:** barra fixa com "Salvar" / "Descartar", e aviso ao sair com alterações não salvas.
- **Campos avançados recolhidos** (agendamento da promoção, SEO) até a pessoa pedir.
- **No celular** vira uma coluna só. A Shopify sobe o status para o topo.

#### Estrutura proposta para a Daverdinha

Desktop, duas colunas (principal ~2/3, lateral ~1/3), na largura padrão do admin:

| Coluna principal | Coluna lateral |
|---|---|
| **Informações:** nome, descrição | **Status:** "Aparece no site" (ligado/desligado) |
| **Fotos:** `ProductImagesInput` (a primeira é a capa), com mais espaço para reordenar | **Organização:** categoria, destaque, ordem |
| **Preço:** preço; preço promocional e "Agendar promoção" recolhido (Fase A) | **Prévia:** o card do produto como aparece na vitrine (foto, nome, preço "de/por") |
| **Estoque e prazo:** pronta entrega (quantidade) ou sob encomenda (prazo em dias), como hoje | **Link:** endereço do produto no site + "Ver no site" (só ao editar) |
| *(depois)* **Buscadores (SEO):** título, descrição e prévia do Google, recolhido (Fase E) | |
| *(depois)* **Variações** (Fase E) | |

Celular: uma coluna, na ordem Status → Informações → Fotos → Preço → Estoque → Organização → Prévia.

**Rodapé e ações:**

- **Barra fixa** embaixo com "Salvar" (e "Descartar alterações" ao editar), visível só quando há mudança. Ao criar, sempre visível.
- **Topo:** voltar para "Produtos" e o nome do produto como título. Ao editar, um menu com "Ver no site", "Duplicar" (Fase E) e "Excluir" (o arquivamento que já existe, com o `ConfirmDialog` atual).
- **Aviso ao sair** da página (link do menu ou fechar a aba) com alterações não salvas.

#### Tarefas

- [ ] **Rotas** `src/app/admin/produtos/novo/page.tsx` e `src/app/admin/produtos/[id]/page.tsx`.
  - A lista (`/admin/produtos`) troca a abertura do modal por links: "Novo produto" vai para `/novo`, e a linha do produto vai para `/[id]`.
- [ ] **Formulário `ProductForm`** em `src/features/admin/components/`, extraído do `ProductDialog`.
  - Mesmos campos, mesma validação e o mesmo envio multipart (`POST /products` e `PATCH /products/:id`, com as fotos no mesmo request). **A API não muda.**
  - Organizado nos cards acima, com um componente `FormCard` (título + conteúdo) reaproveitável em outras páginas de detalhe (eventos, depois).
- [ ] **Depois de criar**, vai para a página do produto criado com o aviso "Produto criado". Depois de salvar, fica na página com "Alterações salvas".
- [ ] **Estado sujo e aviso de saída:** comparar os valores do form com os carregados. `beforeunload` para fechar a aba e confirmação nos links internos.
- [ ] **Prévia** usando o mesmo componente de card do site (`ProductCard`), quando der para importar sem trazer a paleta do site para o admin. Se não der, uma prévia simples e neutra (foto + nome + preço). Conferir na implementação, por causa da preferência de admin neutro.
- [ ] **Carregamento e erros:**
  - loading visível enquanto o produto carrega;
  - produto inexistente ou arquivado vira "Produto não encontrado", com link para a lista.
- [ ] **Remover** `ProductDialog` e o teste dele. O teste novo cobre:
  - criar;
  - editar;
  - validação (estoque × prazo);
  - aviso de sair com alterações;
  - navegação a partir da lista.
- [ ] **Categorias continuam em modal** (`ProductCategoryDialog`): têm 4 campos e não crescem.

### Fase A: preço promocional (pequena, alto impacto)

**API**

- [ ] **Schema.** Em `Product`, criar `promoPrice Decimal? @db.Decimal(10,2)`, `promoStartsAt DateTime?` e `promoEndsAt DateTime?`.
  - Migração aditiva, pelo caminho seguro do README.
  - Seed com um produto em promoção.
- [ ] **Preço efetivo.** Função `effectivePrice(product, now)` em `src/products/`. Usa `promoPrice` quando ele existe, é menor que `price` e o momento está dentro da janela (sem data = sempre).
  - Usada na cotação, na criação do pedido e no catálogo público.
- [ ] **DTO.** Validar `promoPrice < price` e `promoEndsAt > promoStartsAt`.
- [ ] **Catálogo público.** Devolve `price` (o efetivo) e `listPrice` (o cheio, só quando há promoção ativa).
- [ ] **Pedido.** `SiteOrderItem` ganha `listPrice Decimal?`, para o e-mail e o admin mostrarem "de/por". O `unitPrice` continua sendo o cobrado.
- [ ] **Specs:** janela de datas, promoção maior que o preço (ignorada) e cotação com promoção.

**Site**

- [ ] **Formulário de produto no admin** (já na página da Fase 0, card "Preço"):
  - campo "Preço promocional (opcional)";
  - "Agendar promoção" abre os dois campos de data;
  - a prévia do selo "-20%" aparece abaixo.
- [ ] **Vitrine, página do produto e carrinho:**
  - preço "de" riscado + preço "por" + selo "-X%";
  - componente único `ProductPrice`, no design system do site.
- [ ] **Lista de produtos no admin:** marcador "Em promoção".

### Fase B: cupom de desconto básico

**API**

- [ ] **Model `Coupon`:**

  | Campo | Detalhe |
  |---|---|
  | `id` | |
  | `code` | Único, sempre em maiúsculas |
  | `type` | `percent` / `fixed` / `free_shipping` |
  | `value` | Decimal |
  | `minSubtotal` | Opcional |
  | `startsAt?`, `endsAt?` | Validade |
  | `maxUses?` | Limite de usos total |
  | `active` | |
  | `excludePromoItems` | Default `true`: não acumula com preço promocional |
  | `createdAt`, `updatedAt` | |

  - Seed com um cupom de exemplo.
- [ ] **`SiteOrder`:**
  - novos campos `couponId?`, `couponCode?` (cópia do código) e `discount Decimal @default(0)`;
  - `total = subtotal − discount + deliveryFee`;
  - os pedidos antigos ficam com `discount = 0`.
- [ ] **CRUD `/coupons`:**
  - admin, paginado, com `?q=` por código;
  - excluir um cupom já usado = desativar, porque os pedidos guardam o código.
- [ ] **Cotação e criação do pedido aceitam `couponCode`.**
  - A cotação responde `coupon: { code, discount } | { code, error }`.
  - Mensagens de erro claras: "Cupom não encontrado", "Cupom expirado", "Pedido mínimo de R$ X para este cupom", "Este cupom esgotou".
  - Na criação do pedido, o limite de usos é checado **na mesma transação** da reserva de estoque.
- [ ] **Pagar.me:**
  - rateio do desconto nos itens (ver seção 2), se o link não aceitar desconto nativo;
  - teste unitário garantindo que a soma enviada == `total` do pedido, centavo a centavo.
- [ ] **Uso do cupom:**
  - conta quando o pedido é pago (`paid`);
  - pedido pendente reserva o uso; vencido ou cancelado libera.
- [ ] **E-mails e admin:** mostram "Cupom XXXX: −R$ Y".

**Site**

- [ ] **Checkout:**
  - campo "Tem um cupom?", que abre input + "Aplicar" e recalcula pela cotação;
  - o resumo mostra a linha de desconto;
  - o cupom vai no `createCheckout`.
- [ ] **Admin, menu Loja → Cupons:**
  - lista com código, desconto, validade, usos e situação (ativo, agendado, expirado, esgotado);
  - formulário com prévia em texto ("15% de desconto em pedidos acima de R$ 100, até 30/11, máximo 50 usos").
- [ ] **Link com cupom** (`?cupom=CODIGO`) que já aplica no carrinho: bom para divulgar no Instagram e no WhatsApp.

### Fase C: promoções da loja

- [ ] **Frete grátis acima de R$ X.** Em `StoreSettings`, criar `freeShippingMinSubtotal Decimal?`. O carrinho mostra "Faltam R$ Y para frete grátis".
- [ ] **Desconto no Pix.** Só se o Pagar.me permitir (verificação da seção 2).
- [ ] **Cupom de frete grátis.** Já coberto pelo `type`, e entra na UI nesta fase se não entrar na B.

### Fase D: restrições e relatórios

- [ ] **Cupom restrito a categorias ou produtos.** Tabelas `CouponCategory` e `CouponProduct`. O desconto incide só sobre os itens elegíveis.
- [ ] **Limite por cliente** (por e-mail normalizado). Sem conta, é um limite "boa-fé": quem trocar de e-mail burla.
- [ ] **Cupom nos ingressos**, se a cliente quiser.
- [ ] **Relatório por cupom:** usos, receita e desconto total.

### Fase E: experiência de configuração (backlog)

Pela ordem de valor percebido para a cliente:

1. Guia de configuração no Dashboard.
2. Duplicar produto.
3. Agendamento de entrega e mensagem de presente.
4. Carrinho abandonado e "Avise-me quando chegar".
5. Variações de produto. É a maior: muda o estoque e o carrinho.

## 4. Perguntas para a cliente antes da Fase B

1. Cupom e preço promocional podem se somar no mesmo item? (Recomendação: **não**, que é o padrão das plataformas e protege a margem.)
2. Quer frete grátis acima de um valor? Qual valor?
3. Desconto no Pix interessa? (Depende de o Pagar.me permitir no link.)
4. Cupom vale também para ingressos de eventos?
5. Precisa de limite de uso por cliente, ou basta o limite total?

## 5. Verificações técnicas antes de começar

- [ ] **Pagar.me, desconto no link.** `POST /paymentlinks` aceita desconto nativo (no carrinho ou por meio de pagamento)? Perguntar ao contato do Pagar.me junto com as chaves.
- [ ] **Pagar.me, valor por item.** O link aceita item com valor ajustado (rateio) sem regra de valor mínimo por item?
- [ ] **Cache das promoções agendadas.** Definir como a vitrine revalida na virada de uma promoção: cron de 5 min ou aceitar o `revalidate` atual.
