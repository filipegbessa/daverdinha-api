import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationMessengerService } from '../messaging/conversation-messenger.service';
import { MediaStorageService } from '../media/media-storage.service';
import {
  MEDIA_RULES,
  baseMimeType,
  type MediaKind,
} from '../whatsapp/whatsapp-client.service';

import { ListConversationsDto } from './dto/list-conversations.dto';
import { isForeignKeyViolation } from '../common/prisma-errors';
import { BOT_ACTIVE_RESET } from './conversation-state';
import { pageBounds, paginated } from '../common/pagination';
import { toMoneyOrNull } from '../common/money';
import { normalizePhone } from '../common/format-phone';
import { formatMegabytes, type UploadedFileData } from '../common/uploads';
import {
  ListMessagesDto,
  DEFAULT_MESSAGES_LIMIT,
} from './dto/list-messages.dto';

const CONVERSATION_NOT_FOUND = 'Conversa não encontrada.';

const MESSAGE_INCLUDE = {
  order: { include: { items: true } },
  repliedTo: { select: { id: true, kind: true, body: true, direction: true } },
} as const;

type MessageRow = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

/**
 * A mensagem como sai pro admin: igual à linha, com o `unitPrice` dos itens
 * do pedido do catálogo em `number` (ou `null`), como todo preço da API.
 */
function toMessageView(message: MessageRow) {
  if (!message.order) return message;
  return {
    ...message,
    order: {
      ...message.order,
      items: message.order.items.map((item) => ({
        ...item,
        unitPrice: toMoneyOrNull(item.unitPrice),
      })),
    },
  };
}

/**
 * O banco guarda `5521…`, só dígitos; a busca chega como a operadora digitou
 * ("98444-8130", "+55 (21) 98444-8130"). Compara só os dígitos, e também a
 * forma normalizada quando ela existe (DDD + número sem o 55 ganha o 55).
 * Sem dígito nenhum (busca por nome), não filtra por telefone.
 */
function phoneFilters(search: string): Prisma.ConversationWhereInput[] {
  const digits = search.replace(/\D/g, '');
  if (!digits) return [];
  const normalized = normalizePhone(search);
  return [...new Set([digits, ...(normalized ? [normalized] : [])])].map(
    (value) => ({ phone: { contains: value } }),
  );
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: ConversationMessengerService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  /**
   * Devolve uma URL assinada para a mídia da mensagem — **não** os bytes, e
   * **não** um redirect.
   *
   * Um redirect 302 foi a primeira ideia e não funciona: quem consome isto é
   * uma tag `<img>`, e `<img>` não manda header nenhum. O admin autentica com
   * `Authorization: Bearer` contra uma API em outra origem, então a requisição
   * chegaria anônima e o guard responderia 401. Devolvendo JSON, quem busca é
   * o `apiFetch` (que leva o token) e a URL assinada — que não precisa de
   * auth — vai direto no `src`.
   *
   * Proxiar os bytes por aqui seria a outra saída, e custaria egress da Vercel
   * justamente onde o do R2 é grátis.
   *
   * A URL vale poucos minutos de propósito: comprovante de pagamento passa por
   * aqui, e uma URL longeva vazaria em histórico e cache.
   */
  async mediaUrl(
    conversationId: string,
    messageId: string,
    options?: { download?: boolean },
  ): Promise<{ url: string }> {
    // Escopado à conversa da URL: solto, saber um id de mensagem bastaria
    // para ler mídia de qualquer conversa.
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
    });

    // Mesma resposta para "não é dessa conversa" e para "não tem arquivo" —
    // que cobre tanto mensagem de texto quanto imagem já expurgada pela
    // retenção. Distinguir os casos só contaria ao cliente o que existe.
    if (!message?.mediaKey) {
      throw new NotFoundException('Mídia não encontrada.');
    }

    const url = await this.mediaStorage.signedUrl(message.mediaKey, {
      download: options?.download ?? false,
    });
    return { url };
  }

  /**
   * A page of conversations, newest activity first.
   *
   * Filters run in the database rather than the browser: filtering a single
   * page client-side would silently hide matches that sit on other pages.
   *
   * Worth knowing about the ordering: `updatedAt` is both the sort key and a
   * value that changes every time a message arrives, so a conversation can
   * jump to page 1 while the operator is reading page 3 — which shifts
   * everything after it. Page 1, where the operator actually works, is never
   * affected; deeper pages can repeat or skip a row between polls. That's an
   * accepted trade for having real page numbers.
   */
  async list(query: ListConversationsDto = {}) {
    const { page, perPage, skip, take } = pageBounds(query);
    const search = query.q?.trim();
    const where: Prisma.ConversationWhereInput = {
      ...(query.unread ? { unread: true } : {}),
      ...(query.categoryId
        ? { categories: { some: { categoryId: query.categoryId } } }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              ...phoneFilters(search),
            ],
          }
        : {}),
    };

    const [rows, total, unreadTotal] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: { categories: { include: { category: true } } },
      }),
      this.prisma.conversation.count({ where }),
      // Deliberately unfiltered: this feeds the nav badge, which counts every
      // conversation waiting on a human, not just the ones on this page.
      this.prisma.conversation.count({ where: { unread: true } }),
    ]);

    const items = rows.map(({ categories, ...conversation }) => ({
      ...conversation,
      categories: categories.map((c) => c.category),
    }));

    return { ...paginated(items, total, page, perPage), unreadTotal };
  }

  /**
   * The conversation plus the tail of its transcript. Older messages come
   * from `listMessages` as the operator scrolls up — loading a year of
   * history to show the last screenful is what made this endpoint expensive
   * on a poll.
   */
  async getWithMessages(id: string, messageLimit = DEFAULT_MESSAGES_LIMIT) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: messageLimit + 1,
          include: MESSAGE_INCLUDE,
        },
        categories: { include: { category: true } },
      },
    });
    if (!conversation) {
      throw new NotFoundException(CONVERSATION_NOT_FOUND);
    }

    const { categories, messages, ...rest } = conversation;
    const hasMoreMessages = messages.length > messageLimit;
    const page = hasMoreMessages ? messages.slice(0, messageLimit) : messages;

    return {
      ...rest,
      categories: categories.map((c) => c.category),
      // Fetched newest-first so the database can stop at `take`; handed back
      // oldest-first because that's the order a transcript reads in.
      messages: page.reverse().map(toMessageView),
      hasMoreMessages,
    };
  }

  /**
   * Two modes over the same index: `since` for the poll (what arrived while
   * the operator was looking) and `before` for scrolling back through
   * history. Both always return oldest-first.
   */
  async listMessages(conversationId: string, query: ListMessagesDto = {}) {
    const limit = query.limit ?? DEFAULT_MESSAGES_LIMIT;

    if (query.since) {
      const recent = await this.prisma.message.findMany({
        where: { conversationId, createdAt: { gte: query.since } },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include: MESSAGE_INCLUDE,
      });
      return recent.map(toMessageView);
    }

    const older = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(query.before ? { createdAt: { lt: query.before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: MESSAGE_INCLUDE,
    });
    return older.reverse().map(toMessageView);
  }

  async addCategory(conversationId: string, categoryId: string): Promise<void> {
    await this.findRow(conversationId);
    try {
      await this.prisma.conversationCategory.upsert({
        where: { conversationId_categoryId: { conversationId, categoryId } },
        update: {},
        create: { conversationId, categoryId },
      });
    } catch (error) {
      // A conversa já foi conferida acima, então a FK que falhou é a do marcador.
      if (isForeignKeyViolation(error)) {
        throw new NotFoundException('Marcador não encontrado.');
      }
      throw error;
    }
  }

  async removeCategory(
    conversationId: string,
    categoryId: string,
  ): Promise<void> {
    await this.prisma.conversationCategory.deleteMany({
      where: { conversationId, categoryId },
    });
  }

  async reply(id: string, text: string, replyToMessageId?: string) {
    const conversation = await this.findRepliable(id);
    // O messenger marca a conversa como lida e atualiza o updatedAt na mesma
    // transação da mensagem. Ele também valida o replyToMessageId (existe, tem
    // wamid, é da mesma conversa) e lança BadRequestException sozinho quando
    // a citação não dá pra honrar.
    return this.messenger.sendText(conversation, text, { replyToMessageId });
  }

  /**
   * Envia uma imagem ao cliente. Os limites são os mesmos que valem para a
   * imagem que chega — conferidos **antes** de gastar upload para a Meta, e
   * aqui em vez de no messenger porque são regra de entrada da API.
   */
  async replyImage(
    id: string,
    file: UploadedFileData,
    options: { caption?: string; replyToMessageId?: string },
  ) {
    const mimeType = this.assertUploadable(
      file,
      'image',
      'Só é possível enviar imagem JPEG, PNG ou WebP.',
      'A imagem excede o limite de',
    );
    const conversation = await this.findRepliable(id);

    // O messenger é quem manda e grava na mesma transação, e é ele que
    // valida a citação — mesma divisão do reply de texto.
    return this.messenger.sendImage(
      conversation,
      { buffer: file.buffer, mimeType },
      {
        caption: options.caption,
        replyToMessageId: options.replyToMessageId,
      },
    );
  }

  /**
   * Envia um áudio ao cliente — mesmas regras de `replyImage`, com os tipos e
   * o teto de áudio. Um `audio/ogg` (opus) chega como mensagem de voz.
   */
  async replyAudio(
    id: string,
    file: UploadedFileData,
    options: { replyToMessageId?: string },
  ) {
    const mimeType = this.assertUploadable(
      file,
      'audio',
      'Só é possível enviar áudio OGG (opus), MP3, M4A, AAC ou AMR.',
      'O áudio excede o limite de',
    );
    const conversation = await this.findRepliable(id);

    return this.messenger.sendAudio(
      conversation,
      { buffer: file.buffer, mimeType },
      { replyToMessageId: options.replyToMessageId },
    );
  }

  /**
   * Confere tipo e tamanho e devolve o tipo sem parâmetros — o navegador pode
   * mandar `audio/ogg; codecs=opus`, e é a forma curta que a Meta e o R2
   * recebem.
   */
  private assertUploadable(
    file: UploadedFileData,
    kind: MediaKind,
    unsupportedMessage: string,
    /** O começo da frase; o teto em MB sai do próprio `maxBytes`. */
    tooLargePrefix: string,
  ): string {
    const rules = MEDIA_RULES[kind];
    const mimeType = baseMimeType(file.mimetype);
    if (!rules.mimeTypes.includes(mimeType)) {
      throw new BadRequestException(unsupportedMessage);
    }
    if (file.size <= 0) {
      throw new BadRequestException('Arquivo vazio.');
    }
    if (file.size > rules.maxBytes) {
      throw new BadRequestException(
        `${tooLargePrefix} ${formatMegabytes(rules.maxBytes)}.`,
      );
    }
    return mimeType;
  }

  private async findRow(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (!conversation) throw new NotFoundException(CONVERSATION_NOT_FOUND);
    return conversation;
  }

  private async findRepliable(id: string) {
    const conversation = await this.findRow(id);
    if (conversation.status !== 'paused_human') {
      throw new BadRequestException(
        'Só é possível responder conversas transferidas pra um atendente.',
      );
    }
    return conversation;
  }

  async reactivate(id: string) {
    const conversation = await this.findRow(id);
    if (conversation.status !== 'paused_human') {
      throw new BadRequestException(
        'Só é possível reativar conversas transferidas pra um atendente.',
      );
    }
    return this.prisma.conversation.update({
      where: { id },
      data: { ...BOT_ACTIVE_RESET },
    });
  }

  async pause(id: string) {
    const conversation = await this.findRow(id);
    if (conversation.status !== 'bot_active') {
      throw new BadRequestException(
        'Só é possível pausar conversas com o bot ativo.',
      );
    }
    return this.prisma.conversation.update({
      where: { id },
      data: { status: 'paused_human' },
    });
  }

  async updateName(id: string, name: string) {
    await this.findRow(id);
    return this.prisma.conversation.update({ where: { id }, data: { name } });
  }
}
