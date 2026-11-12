import { Test } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { PublicEventsController } from './public-events.controller';
import { EventsService } from './events.service';
import { ClerkAuthGuard } from '../common/auth/clerk-auth.guard';

describe('events controllers', () => {
  let admin: EventsController;
  let pub: PublicEventsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      listUpcoming: jest.fn().mockResolvedValue([]),
      findPublishedBySlug: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [EventsController, PublicEventsController],
      providers: [{ provide: EventsService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    admin = moduleRef.get(EventsController);
    pub = moduleRef.get(PublicEventsController);
  });

  it('forwards admin calls with the uploaded cover', () => {
    const file = { mimetype: 'image/png', buffer: Buffer.from('a') };
    const dto = {
      title: 'Oficina',
      description: 'd',
      startsAt: '2026-11-21T13:00:00Z',
      endsAt: '2026-11-21T15:00:00Z',
    };

    admin.list({ q: 'ofi' });
    admin.create(dto, file);
    admin.update('e1', { removeImage: true });
    admin.remove('e1');

    expect(service.list).toHaveBeenCalledWith({ q: 'ofi' });
    expect(service.create).toHaveBeenCalledWith(dto, file);
    expect(service.update).toHaveBeenCalledWith(
      'e1',
      { removeImage: true },
      undefined,
    );
    expect(service.remove).toHaveBeenCalledWith('e1');
  });

  it('guards the admin controller and leaves the public one open', () => {
    const guards = (target: object) =>
      Reflect.getMetadata('__guards__', target) as unknown[] | undefined;
    expect(guards(EventsController)).toContain(ClerkAuthGuard);
    expect(guards(PublicEventsController)).toBeUndefined();
  });

  it('serves the public agenda and event pages', async () => {
    expect(await pub.listUpcoming()).toEqual([]);
    pub.findBySlug('oficina');
    expect(service.findPublishedBySlug).toHaveBeenCalledWith('oficina');
  });
});
