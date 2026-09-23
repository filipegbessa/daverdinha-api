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
  ALLOWED_MEDIA_TYPES,
  MAX_MEDIA_BYTES,
} from '../whatsapp/whatsapp-client.service';

/**
 * A forma mínima do arquivo que o multer entrega. Declarada aqui em vez de
 * depender de `@types/multer`, que o projeto não instala — só estes três
 * campos são usados.
 */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}
import { ListConversationsDto } from './dto/list-conversations.dto';
import { pageBounds, paginated } from '../common/pagination';
import {
  ListMessagesDto,
  DEFAULT_MESSAGES_LIMIT,
} from './dto/list-messages.dto';

const MESSAGE_INCLUDE = {
  order: { include: { items: true } },
  repliedTo: { select: { id: true, kind: true, body: true, direction: true } },
} as const;

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
      throw new NotFoundException('Mídia não encontrada');
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
              { phone: { contains: search } },
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
      throw new NotFoundException(`Conversa ${id} não encontrada`);
    }

    const { categories, messages, ...rest } = conversation;
    const hasMoreMessages = messages.length > messageLimit;
    const page = hasMoreMessages ? messages.slice(0, messageLimit) : messages;

    return {
      ...rest,
      categories: categories.map((c) => c.category),
      // Fetched newest-first so the database can stop at `take`; handed back
      // oldest-first because that's the order a transcript reads in.
      messages: page.reverse(),
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
      return this.prisma.message.findMany({
        where: { conversationId, createdAt: { gte: query.since } },
        orderBy: { createdAt: 'asc' },
        take: limit,
        include: MESSAGE_INCLUDE,
      });
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
    return older.reverse();
  }

  async addCategory(conversationId: string, categoryId: string): Promise<void> {
    await this.prisma.conversationCategory.upsert({
      where: { conversationId_categoryId: { conversationId, categoryId } },
      update: {},
      create: { conversationId, categoryId },
    });
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
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
    });
    if (conversation.status !== 'paused_human') {
      throw new BadRequestException(
        'Só é possível responder conversas transferidas pra um atendente.',
      );
    }
    // The messenger marks the conversation read and bumps updatedAt as part
    // of the same transaction as the message itself. It also validates
    // replyToMessageId (existence, wamid, same conversation) and throws
    // BadRequestException on its own when the citation can't be honored.
    return this.messenger.sendText(conversation, text, { replyToMessageId });
  }

  /**
   * Envia uma imagem ao cliente. Os limites são os mesmos que valem para a
   * imagem que chega — conferidos **antes** de gastar upload para a Meta, e
   * aqui em vez de no messenger porque são regra de entrada da API.
   */
  async replyImage(
    id: string,
    file: UploadedImage,
    options: { caption?: string; replyToMessageId?: string },
  ) {
    if (!ALLOWED_MEDIA_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Só é possível enviar imagem JPEG, PNG ou WebP.',
      );
    }
    if (file.size <= 0) {
      throw new BadRequestException('Arquivo vazio.');
    }
    if (file.size > MAX_MEDIA_BYTES) {
      throw new BadRequestException('A imagem excede o limite de 5 MB.');
    }

    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
    });
    if (conversation.status !== 'paused_human') {
      throw new BadRequestException(
        'Só é possível responder conversas transferidas pra um atendente.',
      );
    }

    // O messenger é quem manda e grava na mesma transação, e é ele que
    // valida a citação — mesma divisão do reply de texto.
    return this.messenger.sendImage(
      conversation,
      { buffer: file.buffer, mimeType: file.mimetype },
      {
        caption: options.caption,
        replyToMessageId: options.replyToMessageId,
      },
    );
  }

  async reactivate(id: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
    });
    if (conversation.status !== 'paused_human') {
      throw new BadRequestException(
        'Só é possível reativar conversas transferidas pra um atendente.',
      );
    }
    return this.prisma.conversation.update({
      where: { id },
      data: {
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
      },
    });
  }

  async pause(id: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
    });
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

  updateName(id: string, name: string) {
    return this.prisma.conversation.update({ where: { id }, data: { name } });
  }
}
