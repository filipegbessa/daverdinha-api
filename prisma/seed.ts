// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ZONA_SUL = ['Botafogo', 'Catete', 'Copacabana', 'Cosme Velho', 'Flamengo', 'Gávea', 'Humaitá', 'Ipanema', 'Jardim Botânico', 'Lagoa', 'Laranjeiras', 'Leblon', 'São Conrado'];
const CENTRO = ['Cruz Vermelha', 'Lapa', 'Bairro de Fátima', 'Gamboa', 'Saúde', 'Santo Cristo', 'Estácio'];
const ZONA_PORTUARIA = ['toda a região'];
const ZONA_NORTE = ['São Cristóvão', 'Praça da Bandeira', 'Tijuca', 'Grajaú', 'Maracanã', 'Vila Isabel', 'Andaraí'];

async function main() {
  await prisma.botSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      botEnabled: false,
      welcomeMessage: 'Oi! Que bom te ver por aqui 🌱 Bem-vinda(o) à Daverdinha — um espaço pra plantar, criar e brindar. Como posso te ajudar hoje?',
      invalidAttemptsExceededMessage: 'Não consegui entender sua opção, vou te chamar um atendente!',
    },
  });

  const rows = [
    ...ZONA_SUL.map((regionName) => ({ zone: 'Zona Sul', regionName, covered: true })),
    ...CENTRO.map((regionName) => ({ zone: 'Centro', regionName, covered: true })),
    ...ZONA_PORTUARIA.map((regionName) => ({ zone: 'Zona Portuária', regionName, covered: true })),
    ...ZONA_NORTE.map((regionName) => ({ zone: 'Zona Norte', regionName, covered: true })),
  ];

  for (const row of rows) {
    await prisma.deliveryLocation.create({ data: row });
  }

  const menuItems = [
    {
      order: 0,
      topic: 'Locais de entrega',
      type: 'entrega' as const,
      isSystem: true,
      reply: null,
      deliveryPrompt: 'Qual o bairro ou região da entrega?',
      deliveryConfirmedMessage: 'Sim! entregamos na sua região, aguarde um pouco que entro em contato',
      deliveryNotCoveredMessage: 'infelizmente nao fazemos entregas nessa região',
      deliveryUnrecognizedMessage: 'Não consegui identificar essa região, vou te chamar um atendente!',
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
    await prisma.menuItem.create({ data: item });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
