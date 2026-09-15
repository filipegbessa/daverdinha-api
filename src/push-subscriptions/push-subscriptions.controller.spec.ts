import { Test } from '@nestjs/testing';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushSubscriptionsService } from './push-subscriptions.service';

describe('PushSubscriptionsController', () => {
  let controller: PushSubscriptionsController;
  let service: { save: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    service = { save: jest.fn(), remove: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [PushSubscriptionsController],
      providers: [{ provide: PushSubscriptionsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(PushSubscriptionsController);
  });

  it('save() reads the Clerk user id off request.auth.sub and forwards the body to the service', () => {
    const dto = { endpoint: 'https://fcm.googleapis.com/send/xyz', keys: { p256dh: 'a', auth: 'b' } };
    const req = { auth: { sub: 'user_abc123' } } as any;

    controller.save(req, dto);

    expect(service.save).toHaveBeenCalledWith('user_abc123', dto);
  });

  it('remove() forwards the endpoint to the service', () => {
    controller.remove({ endpoint: 'https://fcm.googleapis.com/send/xyz' });

    expect(service.remove).toHaveBeenCalledWith('https://fcm.googleapis.com/send/xyz');
  });
});
