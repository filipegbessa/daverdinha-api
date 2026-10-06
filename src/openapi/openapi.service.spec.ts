import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CategoriesController } from '../categories/categories.controller';
import { CategoriesService } from '../categories/categories.service';
import { ConversationsController } from '../conversations/conversations.controller';
import { ConversationsService } from '../conversations/conversations.service';
import { WebhookController } from '../whatsapp/webhook.controller';
import { BotEngineService } from '../bot-engine/bot-engine.service';
import { ConversationNotifierService } from '../push-notifications/conversation-notifier.service';
import { OpenApiController } from './openapi.controller';
import { OpenApiService } from './openapi.service';

describe('OpenApiService', () => {
  let app: INestApplication;
  let service: OpenApiService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController, ConversationsController, WebhookController, OpenApiController],
      providers: [
        OpenApiService,
        { provide: CategoriesService, useValue: {} },
        { provide: ConversationsService, useValue: {} },
        { provide: BotEngineService, useValue: {} },
        { provide: ConversationNotifierService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    service = app.get(OpenApiService);
  });

  afterEach(() => app.close());

  it('throws a pointed error when configureApp never attached the app', () => {
    expect(() => service.getDocument()).toThrow(/attach/);
  });

  it('documents DTO fields from the generated metadata, including PartialType copies', async () => {
    service.attach(app);
    const { components } = await service.getDocument();
    const schemas = components!.schemas as Record<string, any>;

    expect(schemas.CreateCategoryDto.required).toEqual(['name', 'color']);
    expect(Object.keys(schemas.UpdateCategoryDto.properties)).toEqual(['name', 'color']);
    expect(schemas.UpdateCategoryDto.required).toBeUndefined();
  });

  it('marks Clerk-guarded routes with bearer auth', async () => {
    service.attach(app);
    const { paths } = await service.getDocument();

    expect(paths['/categories'].get!.security).toEqual([{ bearer: [] }]);
  });

  it('describes reply-image as a multipart upload with a binary file field', async () => {
    service.attach(app);
    const { paths } = await service.getDocument();
    const body = paths['/conversations/{id}/reply-image'].post!.requestBody as any;

    expect(body.content['multipart/form-data'].schema.properties.file).toEqual({ type: 'string', format: 'binary' });
  });

  it('leaves out the WhatsApp webhook and the spec endpoint itself', async () => {
    service.attach(app);
    const { paths } = await service.getDocument();

    expect(Object.keys(paths)).not.toContain('/webhook/whatsapp');
    expect(Object.keys(paths)).not.toContain('/openapi.json');
  });

  it('builds the document once and serves the cached copy afterwards', async () => {
    service.attach(app);
    const first = await service.getDocument();

    expect(await service.getDocument()).toBe(first);
  });
});
