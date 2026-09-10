// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeText } from '../src/common/normalize-text';

const prisma = new PrismaClient();

interface BairroRow {
  regiao: string;
  bairro: string;
}

interface CepRangeRow {
  bairro: string;
  ranges: { start: number; end: number }[];
}

async function seedDeliveryLocations() {
  const bairros: BairroRow[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'rj-bairros.json'), 'utf-8'),
  );
  const rangesByBairro: CepRangeRow[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'cep-ranges.json'), 'utf-8'),
  );

  const existing = await prisma.deliveryLocation.findMany();
  const coveredByLegacyName = new Map(
    existing.map((loc) => [normalizeText(loc.regionName), loc.covered]),
  );

  for (const { regiao, bairro } of bairros) {
    const location = await prisma.deliveryLocation.upsert({
      where: { regionName: bairro },
      update: { zone: regiao },
      create: {
        zone: regiao,
        regionName: bairro,
        covered: coveredByLegacyName.get(normalizeText(bairro)) ?? false,
      },
    });

    const hasRanges = (await prisma.cepRange.count({ where: { deliveryLocationId: location.id } })) > 0;
    if (hasRanges) continue; // ranges already seeded for this bairro — never duplicate them

    const rangeRow = rangesByBairro.find((r) => normalizeText(r.bairro) === normalizeText(bairro));
    if (!rangeRow) continue;
    for (const range of rangeRow.ranges) {
      await prisma.cepRange.create({
        data: { startCep: range.start, endCep: range.end, deliveryLocationId: location.id },
      });
    }
  }
}

async function main() {
  await prisma.botSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      botEnabled: false,
      welcomeMessage: 'Oi! Que bom te ver por aqui 🌱 Bem-vinda(o) à Daverdinha — um espaço pra plantar, criar e brindar. Como posso te ajudar hoje?',
      invalidAttemptsExceededMessage: 'Não consegui entender sua opção, vou te chamar um atendente!',
      mediaReceivedMessage: 'Esse tipo de mensagem não é válido por aqui!',
      orderReceivedMessage: 'Aceito! Recebemos seu pedido, já vamos confirmar com você.',
    },
  });

  await seedDeliveryLocations();

  const menuItems = [
    {
      order: 0,
      topic: 'Locais de entrega',
      type: 'entrega' as const,
      isSystem: true,
      reply: null,
      deliveryPrompt: 'Qual o CEP para entrega?',
      deliveryConfirmedMessage: 'Sim! entregamos aí, aguarde um pouco que entro em contato',
      deliveryNotCoveredMessage: 'Infelizmente ainda não fazemos entregas nesse endereço',
      deliveryRetryMessage: 'Esse não é um CEP válido, quer tentar novamente?',
      deliveryUnrecognizedMessage: 'Não consegui identificar seu CEP, vou te chamar um atendente!',
      active: true,
    },
    {
      order: 1,
      topic: 'Bingo de Plantas',
      type: 'texto' as const,
      isSystem: false,
      reply: 'Todo sábado às 16h, aqui na loja!',
      active: true,
    },
    {
      order: 2,
      topic: 'Falar com um atendente',
      type: 'texto' as const,
      isSystem: false,
      reply: 'Aguarde um pouco que já retorno',
      active: true,
    },
  ];

  for (const item of menuItems) {
    // No unique constraint on topic (it's admin-editable), so this can't be
    // a real upsert. Match on the item's natural key instead, and only
    // create when missing — never overwrite an existing row, since the
    // admin may have already customized its reply/messages.
    const where = item.isSystem ? { isSystem: true, type: item.type } : { topic: item.topic };
    const existing = await prisma.menuItem.findFirst({ where });
    if (!existing) {
      await prisma.menuItem.create({ data: item });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
