import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { renderDocsPage } from './docs-page';

/**
 * Public on purpose: the HTML carries nothing secret (a Clerk publishable
 * key is meant for the browser). What it shows is gated twice — by Clerk's
 * sign-in on the page, and by `ClerkAuthGuard` on `/openapi.json`.
 */
@ApiExcludeController()
@Controller('docs')
export class DocsPageController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Cache-Control', 'no-store')
  page(): string {
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new ServiceUnavailableException('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY não configurada.');
    }
    return renderDocsPage(publishableKey);
  }
}
