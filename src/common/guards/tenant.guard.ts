import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { SKIP_TENANT_KEY } from '../decorators/skip-tenant.decorator.js';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skipTenant = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipTenant) return true;

    const request = context.switchToHttp().getRequest();
    const companyId = request.user?.companyId;

    if (!companyId) {
      throw new ForbiddenException('No company context. Select a company first.');
    }

    // Store in CLS for downstream use (Prisma RLS, etc.)
    this.cls.set('tenantId', companyId);

    return true;
  }
}
