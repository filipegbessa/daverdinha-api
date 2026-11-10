import * as fs from 'fs';
import * as path from 'path';
import {
  contactFromFilename,
  detectDateOrder,
  parseWhatsAppExport,
  toMessageRows,
} from './import-whatsapp-export';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '__fixtures__', name), 'utf-8');

describe('parseWhatsAppExport', () => {
  describe('export do Android (dd/mm/aaaa hh:mm - Autor: corpo)', () => {
    const parsed = parseWhatsAppExport(fixture('whatsapp-export-android.txt'));

    it('lista os autores e não confunde o aviso de criptografia com um deles', () => {
      expect(parsed.authors).toEqual(['João Silva', 'Da Verdinha']);
      expect(parsed.systemLines).toBe(1);
      expect(parsed.unparsedLines).toBe(0);
    });

    it('lê a data e a hora de cada mensagem', () => {
      // 08/09 é 8 de setembro (pt-BR), não 9 de agosto.
      expect(parsed.messages[0].timestamp).toEqual(
        new Date(2026, 8, 8, 14, 32, 0),
      );
      expect(parsed.messages[0].body).toBe(
        'Boa tarde! Vocês entregam na Tijuca?',
      );
    });

    it('junta as linhas de continuação na mensagem que as precede', () => {
      const multiline = parsed.messages.find((message) =>
        message.body.startsWith('Perfeito'),
      );
      expect(multiline?.body).toBe(
        'Perfeito\nQueria 2 maços de couve\ne 1 de hortelã',
      );
      // A continuação não pode virar mensagem própria.
      expect(
        parsed.messages.some((m) => m.body === 'Queria 2 maços de couve'),
      ).toBe(false);
    });

    it('marca a mídia oculta como sem conteúdo, preservando o texto original', () => {
      const media = parsed.messages.find((message) => message.contentless);
      expect(media?.body).toBe('<Mídia oculta>');
      expect(parsed.messages.filter((m) => m.contentless)).toHaveLength(1);
    });
  });

  describe('export do iOS ([dd/mm/aaaa, hh:mm:ss] Autor: corpo)', () => {
    const parsed = parseWhatsAppExport(fixture('whatsapp-export-ios.txt'));

    it('ignora o BOM e as marcas invisíveis que o iOS insere', () => {
      expect(parsed.authors).toEqual(['Maria Souza', 'Da Verdinha']);
      expect(parsed.messages[0].body).toBe('Oi, tem manjericão?');
      expect(parsed.unparsedLines).toBe(0);
    });

    it('lê os segundos', () => {
      expect(parsed.messages[0].timestamp).toEqual(
        new Date(2026, 8, 10, 11, 2, 14),
      );
    });

    it('reconhece "imagem ocultada" e a mensagem apagada como sem conteúdo', () => {
      const contentless = parsed.messages.filter((m) => m.contentless);
      expect(contentless.map((m) => m.body)).toEqual([
        'imagem ocultada',
        'Esta mensagem foi apagada.',
      ]);
    });

    it('converte hora em 12h com AM/PM para 24h', () => {
      const evening = parsed.messages[parsed.messages.length - 1];
      expect(evening.body).toBe('Boa noite!');
      expect(evening.timestamp).toEqual(new Date(2026, 8, 12, 19, 5, 0));
    });
  });

  it('não trata um corpo com URL como "Autor: corpo"', () => {
    const parsed = parseWhatsAppExport(
      '08/09/2026 14:32 - João: olha https://daverdinha.com.br/menu\n',
    );
    expect(parsed.authors).toEqual(['João']);
    expect(parsed.messages[0].body).toBe('olha https://daverdinha.com.br/menu');
  });

  it('descarta uma data impossível em vez de deslizar para o mês seguinte', () => {
    const parsed = parseWhatsAppExport('31/02/2026 10:00 - João: oi\n');
    expect(parsed.messages).toHaveLength(0);
    expect(parsed.unparsedLines).toBe(1);
  });
});

describe('detectDateOrder', () => {
  it('reconhece dd/mm quando algum dia passa de 12', () => {
    expect(detectDateOrder('25/09/2026 10:00 - João: oi', 'mdy')).toBe('dmy');
  });

  it('reconhece mm/dd quando é o segundo componente que passa de 12', () => {
    expect(detectDateOrder('09/25/2026 10:00 - João: oi', 'dmy')).toBe('mdy');
  });

  it('usa o fallback quando toda data é ambígua', () => {
    expect(detectDateOrder('08/09/2026 10:00 - João: oi', 'dmy')).toBe('dmy');
  });
});

describe('toMessageRows', () => {
  const parsed = parseWhatsAppExport(fixture('whatsapp-export-android.txt'));

  it('marca as mensagens do negócio como outbound e as do cliente como inbound', () => {
    const rows = toMessageRows(parsed, { me: 'Da Verdinha' });
    // 4 do cliente (a de várias linhas conta uma só) e 3 do negócio.
    expect(rows.filter((row) => row.direction === 'outbound')).toHaveLength(3);
    expect(rows.filter((row) => row.direction === 'inbound')).toHaveLength(4);
    expect(rows[0]).toMatchObject({ direction: 'inbound', kind: 'text' });
  });

  it('casa o nome do negócio sem depender de acento ou caixa', () => {
    const rows = toMessageRows(parsed, { me: 'da verdinha' });
    expect(rows.filter((row) => row.direction === 'outbound')).toHaveLength(3);
  });

  it('traduz mídia oculta para kind invalid_content', () => {
    const rows = toMessageRows(parsed, { me: 'Da Verdinha' });
    expect(rows.filter((row) => row.kind === 'invalid_content')).toHaveLength(
      1,
    );
  });
});

describe('contactFromFilename', () => {
  it('extrai o contato do nome que o WhatsApp dá ao arquivo', () => {
    expect(
      contactFromFilename('/tmp/Conversa do WhatsApp com João Silva.txt'),
    ).toBe('João Silva');
    expect(contactFromFilename('WhatsApp Chat with Maria Souza.txt')).toBe(
      'Maria Souza',
    );
  });

  it('devolve null para um nome fora do padrão', () => {
    expect(contactFromFilename('_chat.txt')).toBeNull();
  });
});
