import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationMessengerService } from '../messaging/conversation-messenger.service';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { pageBounds, paginated } from '../common/pagination';
import {
  ListMessagesDto,
  DEFAULT_MESSAGES_LIMIT,
} from './dto/list-messages.dto';

const MESSAGE_INCLUDE = { order: { include: { items: true } } } as const;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messenger: ConversationMessengerService,
  ) {}

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

  async reply(id: string, text: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
    });
    if (conversation.status !== 'paused_human') {
      throw new BadRequestException(
        'Só é possível responder conversas transferidas pra um atendente.',
      );
    }
    // The messenger marks the conversation read and bumps updatedAt as part
    // of the same transaction as the message itself.
    return this.messenger.sendText(conversation, text);
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
