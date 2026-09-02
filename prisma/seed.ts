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
      welcomeMessage: 'Oi! Que bom te ver por aqui 🌱 Bem-vinda(o) à Da Verdinha — um espaço pra plantar, criar e brindar. Como posso te ajudar hoje?',
      deliveryPrompt: 'Qual o bairro ou região da entrega?',
      deliveryWaitMessage: 'Show, a gente atende sua região 🌿 Aguarde só um instante que já te chamamos por aqui pra fechar os detalhes.',
    },
  });

  const rows = [
    ...ZONA_SUL.map((nomeRegiao) => ({ zona: 'Zona Sul', nomeRegiao, atendida: true })),
    ...CENTRO.map((nomeRegiao) => ({ zona: 'Centro', nomeRegiao, atendida: true })),
    ...ZONA_PORTUARIA.map((nomeRegiao) => ({ zona: 'Zona Portuária', nomeRegiao, atendida: true })),
    ...ZONA_NORTE.map((nomeRegiao) => ({ zona: 'Zona Norte', nomeRegiao, atendida: true })),
  ];

  for (const row of rows) {
    await prisma.deliveryLocation.create({ data: row });
  }

  const menuItems = [
    { ordem: 0, tema: 'Locais de entrega', tipo: 'entrega' as const, resposta: null, active: true },
    { ordem: 1, tema: 'Bingo de Plantas', tipo: 'texto' as const, resposta: 'Todo sábado às 16h, aqui na loja! 🌱', active: true },
    { ordem: 2, tema: 'Falar com um atendente', tipo: 'atendente' as const, resposta: null, active: true },
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
