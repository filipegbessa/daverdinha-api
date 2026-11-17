# Ajustes do admin e do site: plano de implementação (API + site)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** plano, nada implementado (2026-11-17).

Um plano só para os dois repositórios. As tarefas de API ficam aqui (`daverdinha-api`). As do site citam caminhos do `daverdinha`.

As melhorias de configuração da loja (tela própria de produto no lugar do modal, cupom, preço promocional e benchmark) estão em outro plano: `2026-11-17-melhorias-loja-benchmark.md`.

## Roteiro de implementação (os 3 documentos)

Esta seção é a ordem de trabalho dos três planos de 2026-11-17:

- **[A]** este documento: ajustes 1–6;
- **[B]** `2026-11-17-melhorias-loja-benchmark.md`: Fases 0 e A–E;
- **[C]** `2026-11-17-melhorias-mercado.md`: os códigos V1, C1, A1 etc.

Cada **pacote** junta itens de documentos diferentes que mexem nos mesmos arquivos: a tela é aberta uma vez, testada uma vez e vai num deploy só. O detalhe de cada item continua no documento de origem. Aqui fica só o agrupamento, a ordem e o status.

**Status:** `[ ]` a fazer · `[~]` em andamento · `[x]` feito (com a data).

### Onda 1: correções e base (sem mudança no banco)

- [~] **1.1 Checkout.** *(implementado em 2026-11-17, aguardando commit e deploy)* [A] 1 tela de conclusão + [A] 2 nome completo + [C] C1 lembrar a compradora + [C] C2 `begin_checkout`/`view_item` na loja.
  - Arquivos: `CheckoutForm`, `TicketCheckout`, `checkout-form.ts`; na API, `customer.dto.ts`.
- [~] **1.2 Menu.** *(implementado em 2026-11-17, aguardando commit e deploy)* [A] 3 grupos Loja/Site/Bot + "Agenda" → "Eventos".
  - Arquivos: `admin/layout.tsx`, `admin/agenda` → `admin/eventos`.
- [ ] **1.3 Entregas (visual).** [A] 5 modal com os bairros da área.
- [ ] **1.4 Página do pedido.** [C] P1 linha do tempo + [C] P2 "Comprar de novo".
  - Arquivos: `/pedido/[token]`, `OrderStatus`.
- [ ] **1.5 Aviso de pedido novo.** [C] A1 push quando um pedido é pago.
  - Arquivos: API `push-notifications` + `site-orders`.
- [ ] **1.6 Página do produto.** [C] V6 "Dúvida sobre este produto?" no WhatsApp + [C] V5 galeria com zoom.

### Onda 2: estrutura do admin

- [ ] **2.1 Dashboard novo.** [A] 4 interruptor "WhatsApp bot" + [C] R1 resumo de vendas + [C] K2 aviso de estoque baixo + [C] S1 loja em férias.
  - A tela é desenhada uma vez só.
  - Banco: campos novos em `BotSettings` e `StoreSettings`, migração aditiva.
  - Depende de 1.2 (o menu esconde o grupo Bot).
- [ ] **2.2 Tela de produto.** [B] Fase 0 página própria + [B] "Duplicar" (da Fase E) + [C] K2 limite de estoque baixo no produto.
- [ ] **2.3 Entregas, fase 1.** [A] 6, fases 0 e 1: a área passa a definir a cobertura; a coluna `covered` fica sem uso.
  - **Espera:** a cliente revisar os bairros sem área.

### Onda 3: vender mais

- [ ] **3.1 Preço promocional.** [B] Fase A + [C] V3 selos "Últimas unidades" e "Sob encomenda" no card.
  - Usa o mesmo componente de preço e card.
  - Depende de 2.2.
- [ ] **3.2 Pedido pelo admin.** [C] A2 criar pedido e gerar o link de pagamento + [C] A3 imprimir pedido.
  - **Espera:** as chaves de teste do Pagar.me, para validar no sandbox.
- [ ] **3.3 Cupom.** [B] Fase B (com o menu Loja → Cupons).
  - **Espera:** a resposta do Pagar.me sobre desconto no link e as respostas da cliente (seção 4 de [B]).

### Onda 4: alcance

- [ ] **4.1 Promoções da loja.** [B] Fase C frete grátis acima de R$ X + desconto no Pix (se o Pagar.me permitir).
- [ ] **4.2 Catálogo e busca.** [C] M1 feed Google/Meta + [C] V1 busca + [C] V2 ordenar e filtrar.
  - Todos usam as mesmas consultas do catálogo.
- [ ] **4.3 Clientes.** [C] L2 cliente ↔ conversa do WhatsApp + [C] L1 lista de clientes.
- [ ] **4.4 Entregas, fase 2.** [A] 6 remoção da coluna `covered`.
  - É o único `DROP` do roteiro.
  - Alguns dias depois de 2.3 estável.

### Backlog (sem onda ainda)

- [B] Fase D: cupom restrito a categorias e produtos, limite por cliente, relatório.
- [B] Fase E, o que sobrou: guia de configuração, variações, agendamento de entrega, mensagem de presente, carrinho abandonado, "Avise-me".
- [C]:
  - **Vitrine e checkout:** C4 checkout transparente, C5 pedido mínimo, V4 produtos relacionados, V7 e P3 avaliações.
  - **Pós-venda e marketing:** P4 status pelo WhatsApp, M3 captura de e-mail.
  - **Operação:** S2 capacidade por dia, S3 horário de corte, A4 entregas do dia, A5 histórico do pedido, A6 exportar CSV, A7 quadro de preparo.
  - **Catálogo e relatórios:** K3 arrastar para reordenar, K4 planilha, R3 funil.

### Pendências externas (bloqueiam pacotes)

| Pendência | Com quem | Bloqueia |
|---|---|---|
| Chaves de teste (sandbox) do Pagar.me | Pagar.me | 3.2, 3.3, 4.1 (testes de pagamento) |
| O link de pagamento aceita desconto (no carrinho ou só no Pix)? | Pagar.me | 3.3, 4.1 |
| Revisar os bairros "atendidos sem área" e "com área e não atendidos" | Cliente | 2.3 |
| Respostas sobre o cupom (acumular com promoção, ingressos, limite por cliente) | Cliente | 3.3 |
| Valor do frete grátis | Cliente | 4.1 |
| Chave e DNS do Resend | Cliente / nós | Nenhum pacote. Só liga os e-mails, que já estão prontos. |

## Resumo dos ajustes deste documento

| # | Ajuste | Repos | Tamanho | Depende de |
|---|---|---|---|---|
| 1 | Conclusão do checkout (tela de redirecionamento) | site | P | — |
| 2 | Nome completo no checkout (pelo menos 2 nomes) | site + API | P | — |
| 3 | Menu lateral em 3 contextos (Loja, Site, Bot) | site | P | — |
| 4 | Dashboard: interruptor "WhatsApp bot" | API + site | M | 3 |
| 5 | Entregas: modal com os bairros da área | site | P | — |
| 6 | Entregas: fim dos "Bairros atendidos" (a área passa a definir a cobertura) | API + site + banco | G | 5 (opcional) |

A ordem vai do menor risco ao maior:

- **1 e 2** corrigem a compra e podem ir juntos.
- **6** mexe no banco de produção e no bot, por isso fica por último e tem um passo de dados antes.

---

## 1. Conclusão do checkout: tela de redirecionamento

**Problema (causa encontrada):** em `src/features/store/components/CheckoutForm.tsx`, o envio faz `clear()` e depois `redirectToPayment(url)`. O `clear()` esvazia o carrinho, e isso dispara o efeito da linha 76:

```ts
if (ready && items.length === 0) router.replace('/carrinho');
```

O efeito roda antes de o navegador sair para o Pagar.me (`window.location.assign` leva um tempo para trocar a página). Resultado: a cliente vê "carrinho vazio" por alguns segundos.

**Solução:**

- [ ] **Estado `redirecting`.** Quando `createCheckout` dá certo, guardar `{ code, token, paymentUrl }` num estado `redirecting`.
- [ ] **Tela de conclusão.** Com `redirecting` preenchido, o componente renderiza essa tela no lugar do formulário:
  - um spinner (o mesmo padrão de loading visível do site);
  - "Pedido **DV-XXXX** criado!";
  - "Estamos levando você para a página de pagamento seguro do Pagar.me…";
  - um link de reserva, "Se a página não abrir, clique aqui para pagar" (`paymentUrl`);
  - um link secundário "Ver meu pedido" (`/pedido/<token>`), para quem quiser guardar o link.
- [ ] **Bloquear a volta ao carrinho.** O efeito que manda para `/carrinho` não roda enquanto `redirecting` estiver preenchido.
- [ ] **Ordem do esvaziamento.** Esvaziar o carrinho e só depois chamar `redirectToPayment`, já com a tela de conclusão na tela. Se a cliente voltar do Pagar.me pelo botão "voltar", o carrinho já está vazio e o pedido pendente aparece em `/pedido/<token>` com "Pagar agora". É o comportamento atual e fica como está.
- [ ] **Componente compartilhado.** `TicketCheckout.tsx` (ingresso pago) usa a mesma tela, num componente `RedirectingToPayment` em `src/features/store/components/`. A inscrição gratuita continua indo direto para `/pedido/<token>`.
- [ ] **Testes** (`CheckoutForm.test.tsx` e `TicketCheckout.test.tsx`):
  - depois de um envio bem-sucedido aparece "Pedido DV-… criado" e o link de pagamento;
  - `router.replace('/carrinho')` **não** é chamado;
  - `redirectToPayment` é chamado com a URL.

---

## 2. Nome completo no checkout (pelo menos 2 nomes)

**Por quê:** o checkout do Pagar.me (Stone) exige nome e sobrenome. Hoje basta ter 2 caracteres.

**Regra:**

- o nome tem pelo menos **duas palavras**, e cada palavra tem pelo menos uma letra;
- espaços repetidos são colapsados;
- o limite de 64 caracteres continua.

Exemplos: "Maria Silva" e "Ana de Sá" passam; "Maria", "Maria ." e "M 2" não passam.

Mensagem de erro: **"Informe nome e sobrenome."**

- [ ] **API:**
  - Em `src/checkout/dto/customer.dto.ts`, manter `@Length(2, 64)` e somar um `@Matches` (ou um validador `IsFullName` em `src/common/`), com a mesma mensagem.
  - O `@Transform` normaliza os espaços (trim + colapso), para o nome que vai ao Pagar.me já sair limpo.
  - Rodar `npm run openapi:metadata`.
- [ ] **Spec** (`customer.dto.spec.ts`): os casos válidos e inválidos acima.
- [ ] **Quem mais usa o DTO:** o mesmo DTO serve à loja e aos ingressos (pago e gratuito), então a regra vale para os dois. Conferir se a inscrição gratuita deve exigir sobrenome também (recomendação: **sim**, para manter uma regra só e porque o nome sai no ingresso).
- [ ] **Site:**
  - Em `src/features/store/lib/checkout-form.ts` (`validateCustomer`), adicionar a mesma regra numa função `isFullName`, com teste.
  - Label do campo: "Nome completo".
  - Placeholder: "Nome e sobrenome".
  - `autoComplete="name"`, que já deve estar lá; conferir.
  - Vale para `CheckoutForm` e `TicketCheckout` (ambos chamam `validateCustomer`).
- [ ] **Participantes do ingresso** (os nomes extras, além de quem compra): não vão ao Pagar.me. Manter só "nome obrigatório", sem exigir sobrenome. Decisão a confirmar.

---

## 3. Menu lateral em 3 contextos

Hoje `src/app/admin/layout.tsx` tem uma lista plana (`NAV_ITEMS`) com 11 itens. Ela passa a ser uma lista de grupos com título:

| Contexto | Itens |
|---|---|
| *(topo, sem grupo)* | Dashboard |
| **Loja** | Pedidos, Produtos, Categorias, Entregas, Configurações da loja (`/admin/loja`) |
| **Site** | Eventos (hoje "Agenda") |
| **Bot (WhatsApp)** | Conversas, Menu, Mensagens, Marcadores |

- [ ] **Grupos de navegação.** `NAV_GROUPS: { title?: string; items: NavItem[] }[]`, renderizado com um título por grupo:
  - título pequeno, em maiúsculas e cor `muted`, no estilo do admin neutro;
  - o mesmo componente no menu do celular (drawer).
- [ ] **Badge de não lidas.** O badge que hoje fica no item "Conversas" continua lá.
- [ ] **Renomear "Loja" no menu** para "Configurações da loja", porque "Loja" vira o nome do grupo. A página `/admin/loja` mantém a URL.
- [ ] **Renomear "Agenda" para "Eventos"** no menu e no título da página (`PageHeader` em `src/app/admin/agenda/page.tsx` e nas telas filhas: novo evento, editar, lista de presença).
  - Revisar os textos do admin que falam "agenda" se referindo à lista de eventos.
  - **URL:** mudar `/admin/agenda` para `/admin/eventos` e deixar um redirect permanente da URL antiga, para não quebrar favoritos nem o app instalado (PWA). O redirect vai em `next.config` ou num `page.tsx` com `redirect()`.
  - Atualizar os links internos que apontam para `/admin/agenda` e os testes.
  - A página pública `/agenda` do site **não muda**: é o nome que o visitante vê.
- [ ] **Conteúdo do grupo "Site".** Hoje o grupo tem só Eventos. Os interruptores "Site completo", "Loja do site" e "Venda de ingressos" continuam no Dashboard (tarefa 4). Se aparecerem páginas do site (políticas, banners), elas entram aqui.
- [ ] **Teste** (`layout.test.tsx`): os três títulos de grupo aparecem, e cada link fica no grupo certo.

**Decidido (2026-11-17):** "Conversas" fica no grupo Bot e some junto com ele quando o WhatsApp bot é desligado (tarefa 4).

---

## 4. Dashboard: interruptor "WhatsApp bot"

**O que foi pedido:**

- um interruptor novo, **"WhatsApp bot"**, acima do atual;
- **ligado:** o menu mostra os itens do grupo Bot, e o interruptor de baixo ("Bot ativo/desativado", que já existe e liga o atendimento automático no WhatsApp) aparece e funciona como hoje;
- **desligado:** o grupo Bot some do menu e o interruptor de baixo some.

**Modelo:**

- [ ] **Campo novo.** Em `BotSettings`, criar `whatsappModuleEnabled Boolean @default(true) @map("whatsapp_module_enabled")`. O default `true` não muda nada para quem já usa.
  - Migração aditiva (só `ADD COLUMN ... DEFAULT true`), aplicada pelo caminho seguro do README (`migrate diff` → revisar → `db execute` → `migrate resolve`).
  - Re-squash do `_init`.
- [ ] **Regra na API.** Em `PATCH /bot-settings`:
  - aceitar `whatsappModuleEnabled`;
  - **desligar o módulo também desliga o bot** (`botEnabled = false`) na mesma escrita, para nunca sobrar um bot respondendo no WhatsApp sem ninguém no admin para ver;
  - religar o módulo **não** religa o bot sozinho.
  - Atualizar o DTO, rodar `openapi:metadata` e escrever os testes.
- [ ] **O que acontece no webhook com o módulo desligado.** As mensagens continuam sendo gravadas (o webhook sempre responde 200, e o bot já não responde porque `botEnabled` é false). Nada se perde se o módulo for religado.
- [ ] **Site, Dashboard** (`src/app/admin/page.tsx`):
  - seção "WhatsApp" no topo, com `SwitchRow` "WhatsApp bot" e a dica: "Mostra no menu as páginas do bot (Conversas, Menu, Mensagens, Marcadores) e permite ligar o atendimento automático.";
  - ligado, aparece embaixo o interruptor atual do bot, com os avisos atuais (sem item de menu ativo, uso de armazenamento);
  - desligado, o interruptor do bot e os avisos ficam escondidos;
  - a seção "Site e loja" fica como está.
- [ ] **Site, menu** (`layout.tsx`):
  - o grupo Bot só aparece com `whatsappModuleEnabled`;
  - o layout já lê `/conversations` a cada 15 s para o badge, e passa a ler `/bot-settings` uma vez;
  - com o módulo desligado, a leitura de `/conversations` (badge) para.
- [ ] **Rotas escondidas:** acessar `/admin/conversas` direto com o módulo desligado mostra a página normalmente. Não é segurança, só organização do menu. Decisão a confirmar; a alternativa é redirecionar para o Dashboard.
- [ ] **Notificações push** de mensagem nova com o módulo desligado: **sugestão**, não enviar (`ConversationNotifierService` checa a flag). A confirmar.

**Decisões (confirmadas em 2026-11-17):**

1. Desligar o "WhatsApp bot" esconde o grupo Bot inteiro, **incluindo "Conversas"**.
2. Desligar o módulo **também desliga o bot no WhatsApp** (`botEnabled = false` na mesma escrita). Religar o módulo não religa o bot.

---

## 5. Entregas: modal com os bairros da área

**O que foi pedido:** na lista "Áreas de entrega do site", clicar na área abre um modal parecido com o de editar, mas só com a lista de bairros que ela abrange.

- [ ] **Linha clicável.** Em `src/features/admin/components/DeliveryAreasSection.tsx`, o nome da área vira um botão, "Zona Sul · R$ 15,00 · 8 bairros".
  - O "8 bairros" ganha estilo de link, com `aria-label` "Ver os bairros de Zona Sul".
  - Os botões Editar e Excluir continuam.
- [ ] **Modal `DeliveryAreaLocationsDialog`** (somente leitura):
  - título "Bairros de {área}" e subtítulo "{zona} · {valor}";
  - a lista dos bairros em ordem alfabética, com busca quando passar de ~10 itens (reaproveitar `normalizeSearch`);
  - botão "Editar área", que fecha este modal e abre o `DeliveryAreaDialog` atual;
  - botão "Fechar";
  - os dados já vêm em `area.locations`, então não precisa de chamada nova à API.
- [ ] **Teste:** clicar na área abre o modal com os bairros, e "Editar área" abre o modal de edição.

---

## 6. Entregas: fim dos "Bairros atendidos"

**Hoje existem duas listas que dizem a mesma coisa:**

- `DeliveryLocation.covered`, a lista "Bairros atendidos" com checkbox. É dela que **o bot** e o "Onde entregamos" do site leem.
- `DeliveryLocation.areaId`, a área com valor, que é de onde **o checkout** lê. Bairro atendido sem área = "no_area" (o site não entrega e a tela mostra o aviso vermelho).

**Regra nova:** um bairro é atendido **se e só se está numa área de entrega**. O valor da área vale para o site, e o bot responde "entregamos" para os mesmos bairros. A lista "Bairros atendidos" e o campo `covered` deixam de existir.

### Todos os pontos que mudam

**API (`daverdinha-api`)**

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | Remover `covered` de `DeliveryLocation` (fase 2, ver abaixo). Comentários de `DeliveryArea`/`areaId` reescritos ("bairro sem área = não atendido"). |
| `src/delivery-locations/delivery-locations.service.ts` | `fromLocation`: `covered` ⇔ `areaId !== null`. `list()` passa a trazer `areaId`. `listCoveredByZone()` filtra `areaId: { not: null }`. `update()` some. |
| `src/delivery-locations/delivery-locations.controller.ts` | Remover `PATCH /delivery-locations/:id`. O `GET` continua: o modal de área precisa da lista da zona. |
| `src/delivery-locations/dto/update-delivery-location.dto.ts` | Apagar. |
| `src/delivery-locations/delivery-areas.service.ts` | `unassigned` deixa de existir (ou vira "bairros da zona fora de qualquer área", só informativo). Tirar `covered` do `select` e do tipo `DeliveryAreaAdmin.locations`. |
| `src/delivery-locations/public-delivery-locations.controller.ts` | `fee` deixa de ser `number \| null`: `covered` sempre tem valor. Atualizar o comentário do `CepCheck`. |
| `src/site-orders/site-orders.service.ts` | O motivo `no_area` some (vira `not_covered`). Simplificar `deliveryFor` (~linha 1190). |
| `src/bot-engine/delivery-check.service.ts` | Sem mudança de código (usa `resolveCep`), mas **muda o comportamento**: o bot passa a responder pelas áreas. Atualizar o comentário. |
| `prisma/seed.ts` | Parar de ler e gravar `covered`. O seed de amostra cria 1–2 áreas com bairros, para o ambiente local ter cobertura. |
| `src/metadata.ts` | `npm run openapi:metadata`. |
| Specs | `delivery-locations.service.spec.ts`, `delivery-areas.service.spec.ts`, `public-delivery-locations.controller.spec.ts`, `delivery-locations.controller.spec.ts`, `site-orders.service.spec.ts`, `bot-engine` (casos de CEP coberto). |
| e2e | `test/checkout.e2e-spec.ts`: o caso "never charges zero for a covered bairro without an area" vira "bairro sem área não é atendido". `test/delivery-areas.e2e-spec.ts`: os fixtures param de usar `covered`. |
| `README.md` | Seções de `/delivery-locations` (linhas ~122–142), o aviso "o seed cria todo bairro com `covered: false`" e `/checkout/quote` (`no_area`). |

**Site (`daverdinha`)**

| Arquivo | Mudança |
|---|---|
| `src/app/admin/entregas/page.tsx` | Remover a seção "Bairros atendidos" (filtro, checkboxes por zona, `toggleCovered`, `toggleZone`, estados `pending*`). A página fica só com as áreas. Título: "Entregas". |
| `src/features/admin/components/DeliveryAreasSection.tsx` | Tirar o texto "O bot usa só a lista de bairros atendidos" e o aviso de "sem entrega pelo site até entrarem numa área". Novo texto: "Cada área tem um valor de entrega. Os bairros que estão numa área são os atendidos, pelo site e pelo bot." No `ConfirmDialog` de excluir: "Os bairros dessa área deixam de ser atendidos, no site e no bot, até entrarem em outra." |
| `src/features/admin/components/DeliveryAreaDialog.tsx` | Já lista todos os bairros da zona. Tirar a nota "não atendido" (linha ~105) e manter só "hoje em {outra área}". |
| `src/features/admin/types/admin.ts` | Tirar `covered` de `DeliveryLocation` e de `DeliveryAreaAdmin.locations`. |
| `src/features/site/lib/cep-check.ts` e `CepChecker.tsx` | `fee` sempre número em `covered`. Remover o caso `storeEnabled && fee === null`. |
| `src/features/store/types/store.ts` | `DeliveryUnavailableReason` sem `'no_area'`. Ajustar o texto em `deliveryUnavailableText`. |
| `src/features/site/lib/delivery-zones.ts` | Só o comentário (continua lendo `/delivery-locations/covered`). |
| Testes | `entregas/page.test.tsx`, `DeliveryAreasSection.test.tsx`, `cep-check.test.ts`, `delivery-zones.test.ts`, testes do checkout com `no_area`. |

### Migração dos dados (produção tem dados reais)

O risco: um bairro marcado "atendido" que **não está em nenhuma área** deixa de ser atendido pelo bot no dia da troca. Por isso a mudança sai em duas fases.

- [ ] **Fase 0, conferência (antes de qualquer deploy).** Listar em produção, só com leitura:
  - os bairros com `covered = true AND area_id IS NULL`: hoje o bot entrega neles e o site não;
  - os bairros com `covered = false AND area_id IS NOT NULL`: hoje o site entrega neles e o bot diz que não.

  Mandar a lista para a cliente decidir: entra numa área (com valor) ou deixa de ser atendido.

  O admin já mostra o primeiro grupo no aviso vermelho de cada zona, então dá para a própria cliente resolver por lá antes do deploy.
- [ ] **Fase 1, código (deploy 1).** API e site param de ler e escrever `covered`, e a regra nova vale. A coluna continua no banco, sem uso. Assim dá para voltar o deploy sem perder dado.
- [ ] **Fase 2, limpeza (deploy 2, alguns dias depois).** Remover `covered` do schema, re-squash do `_init` e aplicar no banco pelo caminho seguro do README:
  1. `migrate diff --from-url <prod> --to-schema-datamodel`;
  2. revisar: o único DROP deve ser `ALTER TABLE delivery_locations DROP COLUMN covered`;
  3. `db execute`;
  4. `migrate resolve --applied`.

  É o único `DROP` do plano, e só depois da confirmação da cliente.

### Ordem de deploy

Na fase 1, a API sai antes do site. O admin antigo ainda chamaria `PATCH /delivery-locations/:id`, e por alguns minutos isso dá 404 (aceitável), ou a API mantém a rota até o site novo subir e ela sai na fase 2. **Recomendação:** manter a rota na fase 1 como no-op que devolve o bairro, e remover na fase 2.

---

## Fora deste plano

- Cupom, preço promocional e outras configurações da loja: `2026-11-17-melhorias-loja-benchmark.md`.
- As tarefas pendentes já conhecidas (chaves do Pagar.me e do Resend, teste no sandbox, QR no celular): `docs/configurar-chaves.md` e `2026-11-12-pos-venda.md`.
