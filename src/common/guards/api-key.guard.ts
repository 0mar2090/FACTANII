import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_API_KEY_KEY } from '../decorators/api-key-auth.decorator.js';
import { ApiKeyService } from '../../modules/auth/strategies/api-key.strategy.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isApiKey = this.reflector.getAllAndOverride<boolean>(IS_API_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isApiKey) return true;

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    const user = await this.apiKeyService.validateApiKey(apiKey);
    request.user = user;

    return true;
  }
}
