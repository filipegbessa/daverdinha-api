# Estado da loja online (API + site)

**Atualizado em 2026-11-18.** Este documento substitui os planos já concluídos:

- loja online V1 (`2026-11-05-loja-online-v1`, nos dois repositórios);
- pós-venda (`2026-11-12-pos-venda`);
- ajustes do admin e do site (`2026-11-17-ajustes-admin-site`);
- melhorias da loja (`2026-11-17-melhorias-loja-benchmark`);
- melhorias inspiradas no mercado (`2026-11-17-melhorias-mercado`).

Eles saíram do repositório e continuam no histórico do git. O que sobrou deles (as tarefas 4.4 e 4.5 e o backlog) está aqui.

O detalhe de como cada parte funciona fica nos READMEs: `daverdinha-api/README.md` (regras e rotas) e `daverdinha/README.md` (telas). Este documento é o mapa: o que existe, o que falta para a loja estar completa e em que ordem.

**Continuam como referência:**

- `docs/configurar-chaves.md`: as chaves do Pagar.me e do Resend, e o roteiro de teste no sandbox;
- `daverdinha/docs/questionario-politicas.md` e `daverdinha/docs/questionario-ingressos.md`: os questionários com a cliente;
- `daverdinha/docs/benchmark-compra-ingresso.md`: a pesquisa que explica a compra de ingresso em duas telas.

## 1. O que temos hoje

### Site (vitrine)

- **Modo de prévia.** Com o interruptor "Site completo" desligado, `/` mostra "Em breve" e o site inteiro fica em `/site`, com `noindex`. É assim hoje em produção. A prévia mostra só o que está cadastrado; a exceção são os 2 destaques de exemplo do topo da home, até o 5.3.
- **Catálogo:**
  - categorias com página própria e texto de abertura;
  - produtos em destaque na home;
  - paginação;
  - ordenar (destaques, novidades, menor e maior preço);
  - filtrar (pronta entrega ou sob encomenda).
- **Busca** pela lupa do cabeçalho, com sugestões enquanto a compradora digita e a página `/busca`. Ignora acento e hífen.
- **Página do produto:**
  - galeria com zoom;
  - preço "de/por" com selo de desconto;
  - selo de pronta entrega, sob encomenda (com prazo) ou esgotado;
  - "Entregamos no seu CEP?";
  - "Dúvida sobre este produto?" no WhatsApp;
  - JSON-LD de produto e breadcrumb.
- **Agenda de eventos** com página por evento.
- **SEO:** sitemap, robots e canonical; `noindex` na prévia, no carrinho, no checkout, no pedido e na busca.
- **Medição:** GA4 com `view_item`, `add_to_cart`, `begin_checkout` e `purchase`.
- **Políticas:** privacidade, trocas e devoluções, e entrega e retirada, linkadas no rodapé e no checkout. Os textos são provisórios: seguem a lei e esperam as respostas da cliente.
- **Dados legais no rodapé:** CNPJ, razão social e endereço (Decreto 7.962/2013).

### Carrinho, checkout e pagamento

- **Carrinho** no navegador, com o resumo no hover no computador.
- **Cotação na API** a cada mudança: preço, estoque, frete e parcelas sempre recalculados, nunca confiados ao navegador.
- **Entrega ou retirada:**
  - a entrega é por área de entrega; a área tem valor, e valor R$ 0,00 é grátis;
  - a retirada usa endereço, horário e instruções cadastrados no admin;
  - o endereço é preenchido pelo CEP.
- **Frete grátis automático** acima de um valor, por área, com a barra "Faltam R$ X".
- **Cupom de desconto:**
  - escopo: pedido, categorias, produtos ou eventos;
  - valor mínimo, desconto máximo, validade e limite de usos;
  - não soma com o preço promocional.
- **Dados da compradora:** nome completo e lembrados no navegador, com "Não sou eu" para limpar.
- **Pagamento pelo link do Pagar.me** (checkout hospedado): Pix e cartão, parcelado sem juros conforme o admin.
- **Confirmação do pagamento:** pelo webhook, com consulta automática ao Pagar.me quando o webhook atrasa.
- **Estoque:** o pedido pendente reserva o estoque por 1 hora; o pedido criado pelo admin reserva por 24 horas.

### Ingressos

- Venda e inscrição gratuita pelo site, em duas telas, com nome por participante.
- Vagas por evento, ingresso com QR, check-in pela câmera e lista de presença no admin.
- Interruptor próprio ("Venda de ingressos").

### Pós-venda

- **Página do pedido** pelo link secreto:
  - linha do tempo e "Comprar de novo";
  - atualização sozinha enquanto o pagamento é confirmado;
  - "Pedido não encontrado" para link inválido.
- **"Meus pedidos":** os links chegam por e-mail, sem conta, com limite de pedidos por e-mail e por IP.
- **E-mails (Resend):** confirmação (com QR no ingresso), pedido pronto, cancelado e estornado.

### Admin

- **Dashboard:**
  - interruptores: site completo, loja, ingressos, WhatsApp bot e loja em férias;
  - resumo de vendas;
  - estoque baixo;
  - aviso quando o pagamento não está configurado.
- **Pedidos:**
  - filtros;
  - status de preparo;
  - cancelar e estornar;
  - reenviar a confirmação;
  - imprimir;
  - "Atualizar pagamento";
  - pedido criado pelo admin com link de pagamento, para vendas combinadas no WhatsApp;
  - push quando um pedido é pago.
- **Clientes:** a lista tirada dos pedidos pagos. A ligação com a conversa do WhatsApp aparece nos dois sentidos.
- **Produtos** em tela própria:
  - estoque ou sob encomenda com prazo;
  - preço promocional com validade;
  - destaque;
  - duplicar.
- **Categorias, entregas** (áreas, valores e bairros), **Promoções** (cupons e frete grátis automático), **Configurações da loja** (retirada e parcelas) e **Eventos** em tela própria.
- **Bot do WhatsApp:**
  - conversas com push;
  - menu, mensagens e marcadores;
  - grupo inteiro escondido quando o módulo está desligado.

### Canais

- **Feed de produtos** em `/feed/produtos.xml`, para o Google Merchant Center e o catálogo da Meta (Instagram e WhatsApp). Ainda não cadastrado.
- **Domínio verificado no Meta Business.**

## 2. O que falta para a loja online estar completa

Separado pelo que bloqueia ou arrisca o lançamento e pelo que só vende mais depois. Cada item diz de quem depende.

### Antes de ligar a loja (bloqueia ou arrisca)

| # | O quê | Por quê | Depende de | Esforço |
|---|---|---|---|---|
| L1 | **Testar o pagamento no sandbox do Pagar.me**: compra com cartão aprovado e recusado, Pix, pedido com cupom e estorno. Conferir as suposições do código (lista em `docs/configurar-chaves.md`). | O código do Pagar.me foi escrito pela documentação. Algumas respostas só aparecem num pagamento de verdade, como o código do pedido na cobrança e a autenticação do webhook. O pedido com cupom vai ao Pagar.me como um item só e ainda não foi testado. | Nós (as chaves de teste já existem) | P |
| L2 | **Chaves de produção e webhook** na Vercel e no painel do Pagar.me, e uma compra real de valor baixo, estornada em seguida. | Sem isso o Dashboard avisa "pagamento não configurado" e ninguém paga. | Cliente (conta Pagar.me) e nós | P |
| L3 | **Textos finais das políticas**: trocas e devoluções, entrega e retirada, privacidade e cancelamento de ingressos. | Obrigação do Decreto 7.962/2013 e do CDC: condições claras antes da compra. Os textos atuais cobrem só o mínimo da lei. O cancelamento de ingresso hoje é só "fale com a gente", e a venda de ingressos já existe. | Cliente (os dois questionários) | P, depois das respostas |
| L4 | **Aviso de cookies e consentimento** antes de carregar o GA4 (e o Pixel da Meta, se entrar). **Feito em 2026-11-18**: aviso com Aceitar e Recusar; o GA só carrega depois de aceitar. | O GA4 carrega hoje sem pedir consentimento. A LGPD pede base legal para cookies de medição, e o padrão do mercado é um aviso com "Aceitar" e "Recusar" e o Consent Mode do Google. | Nós | P |
| L5 | **Limite de pedidos pendentes por IP no checkout.** **Feito em 2026-11-18**: 10 compras por IP por hora, depois 429. | Cada pedido pendente reserva o estoque por 1 hora. Um robô (ou alguém mal-intencionado) pode "comprar" tudo sem pagar e deixar a loja sem estoque. O "Meus pedidos" já tem limite; o checkout não. | Nós | P |
| L6 | **Alerta de erro** no checkout e no webhook (Sentry ou alerta nos logs da Vercel). **Feito em 2026-11-18**: push do admin, e-mail opcional (`ALERT_EMAIL`) e log `[ALERTA]`; ver "Alertas da venda" no README da API. | Hoje uma falha no pagamento só aparece se alguém olhar os logs. Um webhook recusado em silêncio vira pedido pago que parece pendente. | Nós | P |
| L7 | **E-mail fora do spam:** conferir no painel do Resend os e-mails que "não chegaram" e adicionar o registro DMARC no DNS. | O domínio já tem DKIM e SPF. Sem o DMARC, o Gmail e o Outlook desconfiam, e a confirmação do pedido é o e-mail mais importante da loja. | Nós (acesso ao DNS) | P |
| L8 | **Nota fiscal: confirmar com o contador.** | A loja é de um MEI. MEI não precisa emitir nota para pessoa física, mas precisa emitir para empresa, e a venda online conta no limite anual de faturamento. O código não emite nota hoje. | Cliente e contador | — |
| L9 | **Backup do banco:** confirmar quantos dias de restauração (PITR) o plano da Neon guarda. | Pedidos e pagamentos passam a ser dados que não podem se perder. | Nós | — |

### No dia do lançamento

1. Ligar "Site completo" no Dashboard. Assim `/` vira a home, as páginas saem do `noindex` e o catálogo entra no sitemap.
2. Enviar o sitemap no Google Search Console.
3. Cadastrar o feed (`/feed/produtos.xml`) no Google Merchant Center e no catálogo da Meta. Os passos estão no README do site, em "Busca, ordenação e feed do catálogo".
4. Ligar "Loja do site", e "Venda de ingressos" se for o caso.

### Roteiro de código que sobrou

- [ ] **4.5 Produto em mais de uma categoria.** Precisa de migração, só de acréscimo. Desenho na seção 4.
- [ ] **4.4 Entregas, fase 2: remover a coluna `covered`.** É o único `DROP` previsto. Fica para alguns dias depois de as áreas de entrega estarem estáveis em produção. Passos na seção 5.

### Onda 5: conteúdo do site e ajustes (pedido em 2026-11-18)

Os pacotes estão em ordem: primeiro os que não mexem no banco, depois o conteúdo pelo admin. A retirada dos exemplos fica por último, quando já houver conteúdo de verdade para ocupar o lugar deles. O desenho de cada pacote está na seção 6.

- [x] **5.1 Ajustes rápidos do site** *(feito em 2026-11-18)* (sem migração):
  - menu "Produtos" vira "Loja";
  - selo de desconto em cima da foto no card;
  - mais perguntas no FAQ.
- [x] **5.2 Lista de produtos do admin no celular** *(feito em 2026-11-18)* (sem migração): cards organizados no lugar da linha espremida.
- [ ] **5.3 Destaques da home pelo admin** (migração: tabela nova). O slideshow do topo da home, com botão principal com link, WhatsApp opcional com a mensagem pronta, e ordem dos slides.
- [ ] **5.4 "Sobre" pelo admin** (migração: tabela nova). Texto e foto da seção "Sobre" da home.
- [~] **5.5 Tirar os produtos, eventos e destaques de exemplo** (sem migração). *(2026-11-18: saíram os produtos, eventos, carrinho, checkout, compra de ingresso e pedido de exemplo. Falta só tirar os 2 destaques de exemplo, junto com o 5.3.)*
- [ ] **5.6 FAQ pelo admin** (migração: tabela nova). Só se a cliente quiser editar as perguntas sozinha. Até lá, as perguntas de 5.1 ficam no código.

### Depois do lançamento, para vender mais (backlog)

Ordenado por impacto. Esforço: P (até 1 dia), M (2–4 dias), G (1 semana ou mais).

| Item | O quê | Impacto | Esforço |
|---|---|---|---|
| Pixel da Meta | Visualização, carrinho e compra no Meta Ads, como já existe no GA4. Entra junto com o aviso de cookies (L4). | Médio | P |
| Status pelo WhatsApp | Avisar "pago" e "saiu para entrega" pelo WhatsApp, além do e-mail. Precisa de modelo de mensagem aprovado pela Meta. | Alto | M |
| "Últimas unidades" | Selo no card quando o estoque está baixo. Precisa de a API expor o estoque restante no catálogo. | Médio | P |
| Produtos relacionados | "Combina com" na página do produto, começando pela mesma categoria. | Médio | P |
| Carrinho abandonado e "Avise-me" | E-mail para quem começou o checkout e não pagou, e aviso quando um esgotado volta. | Médio | M |
| Agendamento de entrega e mensagem de presente | Data e período da entrega no checkout, e um cartão com recado. | Médio | M |
| Desconto no Pix | Preço menor no Pix. Depende de o link do Pagar.me aceitar valor diferente por meio de pagamento. | Médio | M |
| Checkout transparente | Cartão e Pix na nossa página, sem ir ao link do Pagar.me. | Alto | G |
| Avaliações | Pedidas por e-mail depois da entrega, com moderação no admin. | Médio | G |
| Variações | Tamanho e cor no mesmo produto. A maior de todas: muda o estoque e o carrinho. | Médio | G |
| Pedido mínimo | Valor mínimo para entrega. | Baixo | P |
| Captura de e-mail | Newsletter com cupom de primeira compra. Só depois do L7. | Baixo | P |

### Depois do lançamento, para a operação (backlog)

| Item | O quê | Impacto | Esforço |
|---|---|---|---|
| Entregas do dia | Pedidos a entregar agrupados por área, com link do endereço no Maps. | Médio | M |
| Horário de corte | "Pedidos até 14h saem no mesmo dia". | Médio | P |
| Capacidade por dia | Máximo de pedidos sob encomenda por dia; o prazo cresce quando lota. | Médio | M |
| Histórico do pedido | Linha do tempo no admin (criado, pago, e-mail enviado, status mudado por quem) e nota interna. | Médio | M |
| Exportar pedidos em CSV | Por período, para o contador. | Médio | P |
| Relatório de cupons e promoções | Usos, receita e desconto total. | Médio | P |
| Guia de configuração | Checklist no Dashboard: pagamento, entregas, retirada, políticas, primeiro produto. | Médio | P |
| Quadro de preparo | Colunas "A preparar", "Pronto" e "Entregue". | Baixo | M |
| Reordenar arrastando | Produtos e categorias (o campo `order` já existe). | Baixo | P |
| Planilha de produtos | Importar e exportar. | Baixo | M |
| Funil do GA4 no Dashboard | Visitas → carrinho → checkout → compra. | Baixo | M |

## 3. Pendências externas

| Pendência | Com quem | Bloqueia |
|---|---|---|
| Respostas do questionário de políticas | Cliente | L3 |
| Respostas do questionário de ingressos (agora necessário: a venda de ingressos existe) | Cliente | L3 |
| Conta Pagar.me de produção e o webhook no painel | Cliente | L2 |
| Nota fiscal e limite do MEI | Cliente e contador | L8 |
| Cadastro do feed no Merchant Center e na Meta | Cliente, no dia do lançamento | — |

## 4. Desenho do 4.5: produto em mais de uma categoria

**Hoje:** cada produto tem uma categoria só (`Product.categoryId`, obrigatória, com `RESTRICT` ao apagar a categoria). Ela decide:

- a URL do produto: `/produtos/[categoria]/[produto]` (o site redireciona quando a categoria da URL está desatualizada);
- o breadcrumb, o rótulo do card e o JSON-LD (`category`);
- em quais páginas de categoria o produto aparece, e a contagem de produtos de cada categoria no admin;
- o escopo "Categorias" do cupom;
- o filtro por categoria na lista de produtos do admin.

**Proposta: várias categorias, uma principal.** O padrão das plataformas (Shopify com coleções, Nuvemshop com categorias múltiplas) é o produto aparecer em várias listas, mas ter um endereço só.

- **Categoria principal** (`Product.categoryId`, como hoje): continua decidindo a URL, o breadcrumb, o rótulo do card e o JSON-LD. Nada muda nos links que já existem, nem no Google.
- **Categorias adicionais** (tabela nova `ProductCategoryLink { productId, categoryId }`, chave composta, `CASCADE` dos dois lados): o produto também aparece nas páginas dessas categorias.

**API**

| Onde | Mudança |
|---|---|
| `prisma/schema.prisma` | Tabela `product_category_links`. A principal também entra na tabela, o que simplifica consultar "produtos da categoria X". |
| Produtos (`products.service.ts`) | `categoryIds` no criar e editar (multipart, como os outros campos); a principal sempre faz parte da lista. `listActive(categorySlug)` passa a filtrar pela tabela. O admin recebe `categoryIds` e as categorias com nome. |
| Filtro do admin | `?categoryId=` filtra pela tabela. |
| Categorias (`product-categories.service.ts`) | A contagem de produtos e "categorias ativas com produto" contam pela tabela. Apagar uma categoria continua recusado se ela for a **principal** de algum produto; se for só adicional, o vínculo sai junto. |
| Cupom (`apply-coupon.ts`) | `CouponLine.categoryId` vira `categoryIds`: o item entra no escopo se **qualquer** categoria dele estiver no cupom. |
| Seed | Um produto de exemplo em duas categorias. |
| Migração | Cria a tabela e copia `(id, category_id)` de todo produto (`INSERT … SELECT`), só acréscimo. A coluna `category_id` fica: é a principal. |

**Site e admin**

| Onde | Mudança |
|---|---|
| Tela de produto (`ProductForm`) | Card "Organização": "Categoria principal" (a de hoje) e "Também aparece em" (caixas de seleção com as outras). |
| Lista de produtos do admin | Mostra a principal e "+N" quando há outras. |
| Página de categoria | Lista os produtos que estão nela, principais ou adicionais. O card continua apontando para a URL da categoria principal. |
| Busca do site | A categoria adicional também conta na busca. |
| Página do produto, sitemap e JSON-LD | Sem mudança de URL. Opcional: "Também em: Presentes" com link. |

**Suposições, à espera da confirmação da cliente:** até 5 categorias por produto, para a lista do admin continuar legível. A principal é escolhida explicitamente, porque define o endereço do produto.

## 5. Passos do 4.4: remover a coluna `covered`

Desde 2026-11-17, um bairro é atendido se e só se está numa área de entrega (`DeliveryLocation.areaId`). A coluna `delivery_locations.covered` ficou sem uso, para o deploy poder voltar sem perder dado.

1. Remover `covered` do schema e o `PATCH /delivery-locations/:id`. A rota ainda grava `covered`, mas o valor não muda mais quem é atendido, e o admin novo não a chama.
2. Re-squash do `_init`, pelo caminho seguro do README da API:
   1. `prisma migrate diff --from-url <prod> --to-schema-datamodel prisma/schema.prisma --script`;
   2. revisar: o único `DROP` deve ser `ALTER TABLE delivery_locations DROP COLUMN covered`;
   3. aplicar com `prisma db execute`;
   4. `prisma migrate resolve --applied <pasta>`.

## 6. Desenho da Onda 5

### 5.1 Ajustes rápidos do site

**Menu "Produtos" → "Loja".** Muda o texto no menu do cabeçalho, no menu do celular, no rodapé, no título e na trilha da página `/produtos`, e o "Todos" das categorias continua igual. **O endereço fica `/produtos`**: trocar a URL derrubaria os links que já existem e o que o Google já leu, sem ganho para a compradora.

**Selo de desconto em cima da foto.** No card do catálogo, com promoção valendo, um selo "-17%" no canto superior esquerdo da foto, como nos temas padrão da Shopify e da Nuvemshop. O preço continua com o "de" riscado e o "por" em destaque, e o selo que hoje fica ao lado do preço sai do card, para não repetir. Na página do produto o selo continua ao lado do preço, que é onde o olho está ali. Vale também para o card compacto e para as sugestões da busca.

**Mais perguntas no FAQ.** Hoje são duas (`daverdinha/src/data/faq.ts`). Propostas, com respostas tiradas do que o site já faz:

1. Como faço um pedido? (pelo site, com o carrinho, ou pelo WhatsApp)
2. Quais formas de pagamento vocês aceitam? (Pix e cartão; parcelas conforme o admin)
3. O que é "sob encomenda" e quanto tempo demora?
4. Para quais bairros vocês entregam e quanto custa? (áreas de entrega e frete grátis acima de um valor, quando houver)
5. Posso retirar no ateliê? (endereço e horário cadastrados no admin)
6. Como acompanho meu pedido? (link por e-mail e "Meus pedidos")
7. Posso trocar ou devolver? (resumo da política de trocas, com link)
8. Como funcionam os cupons de desconto?
9. Como compro ingresso para uma oficina ou evento, e o que levo no dia? (QR no e-mail)
10. Posso cancelar um ingresso? (resumo da política, com link)
11. As plantas chegam bem? Como cuido delas?

As respostas que dependem de configuração (retirada, parcelas, loja e ingressos ligados) usam os dados do admin, de `GET /store-settings/public`, para não ficarem desatualizadas. Com a loja desligada, só aparecem as perguntas gerais. O frete grátis não tem rota pública, então a resposta fala da barra do carrinho, sem valor. As de trocas e cancelamento dependem dos questionários (L3): até as respostas chegarem, ficam no texto mínimo da lei, como as páginas de política. A seção ganha o JSON-LD `FAQPage`, que o Google pode mostrar na busca.

### 5.2 Lista de produtos do admin no celular

Hoje cada produto é uma linha com foto pequena, nome, selos e dois botões, e no celular tudo se espreme. **Proposta:** abaixo de 640 px, cada produto vira um card:

- foto maior (64 px) à esquerda, com nome e categoria ao lado;
- preço (com o "de/por" quando há promoção) e o estoque ("12 em estoque", "Sob encomenda · 10 dias", "Esgotado");
- os selos (inativo, destaque, promoção) numa linha;
- tocar no card abre a edição;
- embaixo, uma linha de ações: a chave "No site", "Editar", "Duplicar" (antes só na tela de edição) e "Remover".

No computador, a mesma marcação vira uma linha só, como as outras listas.

**Como ficou (2026-11-18):** sem o menu "⋯", porque o kit de componentes não tem menu e "Remover" já pede confirmação. Os filtros já viravam um botão "Filtros" com gaveta no celular (`FilterBar`), então não mudaram.

### 5.3 Destaques da home pelo admin

**Hoje:** o site já busca `GET /hero-slides/active` (`HeroSlide` em `daverdinha/src/features/site/types/hero-slide.ts`), mas a rota não existe na API. A home mostra os slides de exemplo na prévia e o slide padrão (`DEFAULT_HERO_SLIDE`) no site completo.

**Cadastro** (admin, grupo "Site" → "Destaques"), um slide por linha, na ordem de exibição:

| Campo | Regras |
|---|---|
| Linha de cima (eyebrow) | Opcional, até 60 caracteres. Ex.: "Santo Cristo · Rio de Janeiro". |
| Título | Obrigatório, até 80 caracteres. O título do primeiro slide é o H1 da home. |
| Texto | Opcional, até 200 caracteres. |
| Imagem | Opcional (sem imagem, o fundo da marca). **Uma imagem só**, exibida como hoje no computador e no celular (decidido em 2026-11-18). Aviso de tamanho recomendado (1600 × 900). |
| Botão principal | Texto (até 30 caracteres) e link. O link pode ser do próprio site (`/produtos/vasos`, `/agenda/oficina-x`) ou externo. Sem texto, não há botão. |
| WhatsApp (opcional) | Texto do botão (padrão "Falar no WhatsApp") e a mensagem que já vai escrita na conversa. Sem mensagem, não há botão. |
| Ordem | Arrastar ou setas para cima e para baixo na lista. |
| Ativo e validade | Liga e desliga, e datas opcionais de início e fim, para slides de campanha (decidido em 2026-11-18: entra já). |

**API:**

- tabela `hero_slides`;
- `GET /hero-slides/active` público, só os ativos dentro da validade, na ordem;
- CRUD com Clerk e `PATCH /hero-slides/order`;
- imagem no Vercel Blob, como a dos produtos;
- seed com os slides de exemplo de hoje.

O contrato `HeroSlide` ganha `whatsappLabel` e `whatsappMessage`.

**Site:** o slideshow mostra os dois botões. Sem slide cadastrado, continua o slide padrão, com o texto que já está no código. Com um slide só, não roda.

### 5.4 "Sobre" pelo admin

**Hoje:** o título, o texto e a foto (um placeholder) estão fixos no componente `About`.

**Cadastro** (admin, grupo "Site" → "Sobre"):

- título;
- texto, com parágrafos;
- foto;
- texto do botão para o Instagram, que pode ficar sem.

Um registro só. **API:** tabela `site_content` com uma linha, `GET /site-content/about` público e `PATCH` com Clerk. Sem cadastro, o site usa o texto de hoje.

### 5.5 Tirar os exemplos

**Hoje:** com a API vazia e o site em prévia, aparecem produtos, categorias, eventos e destaques de exemplo (`daverdinha/src/features/site/data/samples.ts`). O carrinho e a página do pedido têm um modo de exemplo para a cliente testar a loja sem pagamento (`preview-quote.ts`, `preview-order.ts`, `/pedido/exemplo`). Os exemplos alcançam 15 arquivos.

**Proposta:**

- Sai tudo:
  - os dados de exemplo;
  - o carrinho e a cotação de exemplo;
  - o pedido de exemplo;
  - o aviso "Prévia: produto de exemplo".
- Vazio passa a ser vazio, como já é no site completo: a seção some, e o catálogo diz "Nenhum produto no catálogo agora".
- **Fica o modo de prévia** (`/site` com `noindex` enquanto o site completo está desligado): ele serve para a cliente revisar o conteúdo de verdade antes do lançamento.

**Inventário dos exemplos (2026-11-18)**, conferido em produção em `/site`:

| Exemplo | Onde aparece hoje | Validado |
|---|---|---|
| 8 produtos e 4 categorias | Só na vitrine da home ("Produtos em destaque"), porque nenhum produto real está marcado como destaque. O catálogo já mostra os produtos reais. | Sim |
| 3 eventos | `/agenda` e a home, porque não há evento real cadastrado | Sim |
| Pedido de exemplo | `/pedido/exemplo?status=…` | Sim |
| 2 destaques do topo da home ("Monte seu terrário com a gente" e "Kits prontos pra presentear"). O primeiro slide é o padrão de verdade e fica. | Topo da home | Não |
| Carrinho e checkout de exemplo: cotação no navegador (entrega R$ 15 para qualquer CEP, até 3x, retirada no ateliê), e "Finalizar" mostra "Prévia: o pagamento ainda não está ligado" | Ao pôr um produto de exemplo no carrinho | Não |
| Compra de ingresso de exemplo: o formulário de um evento de exemplo, que no fim mostra o mesmo aviso | Página de ingressos de um evento de exemplo | Não |
| Faixa "Prévia" no topo, enquanto há conteúdo de exemplo na página | Home, agenda | Sai sozinha com os outros |

**Ao tirar:** a vitrine da home some até a cliente marcar produtos reais como destaque no admin, e a agenda fica vazia até haver evento cadastrado.

**O pedido de exemplo sai junto** (decidido em 2026-11-18). Ele fica em `/pedido/exemplo?status=paid` (ou `pending_payment`, `expired`, `cancelled`, `refunded`), mas nenhum link leva até lá, e ninguém usa.

### 5.6 FAQ pelo admin

Só se a cliente quiser editar as perguntas sozinha. Até lá, as perguntas de 5.1 ficam no código (decidido em 2026-11-18).

**Cadastro** (admin, grupo "Site" → "Perguntas frequentes"):

- pergunta e resposta, com parágrafos e links;
- ordem de exibição;
- ativo.

**API:**

- tabela `faq_items`, sem paginação de propósito, porque são poucas;
- `GET /faq-items/active` público;
- CRUD com Clerk e `PATCH /faq-items/order`;
- seed com as perguntas de 5.1.

**O que muda:**

- as respostas que hoje usam os dados do admin (retirada, parcelas, frete grátis) viram texto fixo, escrito pela cliente;
- o cadastro avisa quando uma resposta cita algo que mudou em outra tela;
- o JSON-LD `FAQPage` continua.

### Decisões da Onda 5 (2026-11-18)

1. **Imagem dos destaques:** uma só, exibida como hoje.
2. **Validade dos slides:** entra já, no 5.3.
3. **FAQ:** fica no código agora; o cadastro pelo admin é o 5.6, se a cliente pedir.
4. **Pedido de exemplo:** sai junto com os outros exemplos, no 5.5.
