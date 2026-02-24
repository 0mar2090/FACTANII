import { Injectable, NestMiddleware } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    const correlationId =
      (req.headers['x-request-id'] as string) || randomUUID();

    this.cls.set('correlationId', correlationId);
    res.setHeader('X-Request-ID', correlationId);

    next();
  }
}
