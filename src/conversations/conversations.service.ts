import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppClientService } from '../whatsapp/whatsapp-client.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppClientService,
  ) {}

  async list() {
    const conversations = await this.prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return conversations.map(({ messages, ...conversation }) => ({
      ...conversation,
      unread: messages[0]?.direction === 'inbound',
    }));
  }

  async getWithMessages(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversa ${id} não encontrada`);
    }
    return conversation;
  }

  async reply(id: string, text: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id } });
    if (conversation.status !== 'paused_human') {
      throw new BadRequestException('Só é possível responder conversas transferidas pra um atendente.');
    }
    await this.whatsapp.sendText(conversation.phone, text);
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId: id, direction: 'outbound', body: text },
      }),
      this.prisma.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }

  async reactivate(id: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id } });
    if (conversation.status !== 'paused_human') {
      throw new BadRequestException('Só é possível reativar conversas transferidas pra um atendente.');
    }
    return this.prisma.conversation.update({
      where: { id },
      data: {
        status: 'bot_active',
        invalidAttempts: 0,
        awaitingDeliveryReply: false,
        awaitingMenuItemAnswerId: null,
      },
    });
  }

  async pause(id: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { id } });
    if (conversation.status !== 'bot_active') {
      throw new BadRequestException('Só é possível pausar conversas com o bot ativo.');
    }
    return this.prisma.conversation.update({
      where: { id },
      data: { status: 'paused_human' },
    });
  }

  updateName(id: string, name: string) {
    return this.prisma.conversation.update({
      where: { id },
      data: { name },
    });
  }
}
