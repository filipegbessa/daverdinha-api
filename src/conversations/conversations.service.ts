import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' } });
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
}
