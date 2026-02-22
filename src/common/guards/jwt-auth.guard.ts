import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { IS_API_KEY_KEY } from '../decorators/api-key-auth.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isApiKey = this.reflector.getAllAndOverride<boolean>(IS_API_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isApiKey) return true; // ApiKeyGuard handles these

    return super.canActivate(context);
  }
}
