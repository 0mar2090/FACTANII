import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { IS_API_KEY_KEY } from '../decorators/api-key-auth.decorator.js';

// Note: This guard checks x-api-key header, hashes it with SHA-256,
// and looks up in DB. The PrismaService will be injected via the auth module.
// For now, this is the skeleton that the auth module will complete.

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isApiKey = this.reflector.getAllAndOverride<boolean>(IS_API_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isApiKey) return true; // Not an API key route

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    // Hash will be compared against DB in auth service
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    request.apiKeyHash = keyHash;

    // The actual DB lookup happens in the API key strategy
    return true;
  }
}
