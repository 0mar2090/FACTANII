import { Injectable, NestMiddleware } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    // tenantId will be set by TenantGuard after auth
    // This middleware ensures CLS context is available
    next();
  }
}
