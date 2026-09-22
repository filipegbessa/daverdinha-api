import { Test } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { ReplyDto } from './dto/reply.dto';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let service: {
    addCategory: jest.Mock;
    removeCategory: jest.Mock;
    reply: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      addCategory: jest.fn(),
      removeCategory: jest.fn(),
      reply: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [{ provide: ConversationsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(ConversationsController);
  });

  it('addCategory() forwards the conversation id and category id', () => {
    controller.addCategory('conv1', 'cat1');
    expect(service.addCategory).toHaveBeenCalledWith('conv1', 'cat1');
  });

  it('removeCategory() forwards the conversation id and category id', () => {
    controller.removeCategory('conv1', 'cat1');
    expect(service.removeCategory).toHaveBeenCalledWith('conv1', 'cat1');
  });

  it('reply() forwards the conversation id, text, and replyToMessageId', () => {
    const dto: ReplyDto = { text: 'Oi!', replyToMessageId: 'm1' };

    controller.reply('conv1', dto);

    expect(service.reply).toHaveBeenCalledWith('conv1', 'Oi!', 'm1');
  });

  it('reply() forwards undefined replyToMessageId when the dto omits it', () => {
    const dto: ReplyDto = { text: 'Oi!' };

    controller.reply('conv1', dto);

    expect(service.reply).toHaveBeenCalledWith('conv1', 'Oi!', undefined);
  });
});
