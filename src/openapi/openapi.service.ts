import { INestApplication, Injectable } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import metadata from '../metadata';

/**
 * Monta o documento OpenAPI que o admin renderiza em `/admin/docs`.
 *
 * É preguiçoso de propósito: varrer todos os controllers custa tempo, e na
 * Vercel isso entraria em todo cold start — inclusive nos do webhook do
 * WhatsApp, que não têm nada a ver com documentação. Só a primeira chamada a
 * `GET /openapi.json` de cada instância paga esse custo.
 */
@Injectable()
export class OpenApiService {
  private app?: INestApplication;
  private document?: Promise<OpenAPIObject>;

  /** Chamado por `configureApp`: `createDocument` precisa da app, e ela não é injetável. */
  attach(app: INestApplication): void {
    this.app = app;
  }

  getDocument(): Promise<OpenAPIObject> {
    if (!this.app) {
      throw new Error('OpenApiService.attach(app) não foi chamado — ver configureApp.');
    }
    this.document ??= this.build(this.app).catch((error) => {
      // Não guarda a falha: a próxima chamada tenta de novo.
      this.document = undefined;
      throw error;
    });
    return this.document;
  }

  private async build(app: INestApplication): Promise<OpenAPIObject> {
    // Ver scripts/generate-openapi-metadata.ts para entender por que os
    // metadados vêm de um arquivo gerado e não do plugin do `nest build`.
    await SwaggerModule.loadPluginMetadata(metadata);
    const config = new DocumentBuilder()
      .setTitle('Daverdinha API')
      .setDescription('Backend do bot de WhatsApp e do painel admin da Daverdinha.')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token de sessão do Clerk.' })
      .build();
    return SwaggerModule.createDocument(app, config);
  }
}
