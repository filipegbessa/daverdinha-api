import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: { conversation: any };

  beforeEach(async () => {
    prisma = { conversation: { findMany: jest.fn(), findUnique: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [ConversationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ConversationsService);
  });

  it('list() returns conversations ordered by updatedAt desc, without messages', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);
    await service.list();
    expect(prisma.conversation.findMany).toHaveBeenCalledWith({ orderBy: { updatedAt: 'desc' } });
  });

  it('getWithMessages() returns the conversation with its messages ordered chronologically', async () => {
    const conversation = { id: '1', messages: [] };
    prisma.conversation.findUnique.mockResolvedValue(conversation);
    const result = await service.getWithMessages('1');
    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    expect(result).toBe(conversation);
  });

  it('getWithMessages() throws NotFoundException when the conversation does not exist', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(service.getWithMessages('missing')).rejects.toThrow(NotFoundException);
  });
});
