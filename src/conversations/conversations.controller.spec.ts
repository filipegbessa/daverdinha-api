import { Test } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let service: { addCategory: jest.Mock; removeCategory: jest.Mock };

  beforeEach(async () => {
    service = { addCategory: jest.fn(), removeCategory: jest.fn() };

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
});
