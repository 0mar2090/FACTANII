import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { RequestUser } from '../../../common/interfaces/index.js';

/**
 * ApiKeyService — Validates API keys by hashing them with SHA-256
 * and looking up the hash in the database.
 *
 * This is NOT a Passport strategy. It is a standalone service used by
 * the ApiKeyGuard to validate `x-api-key` headers.
 *
 * API keys are stored as SHA-256 hashes in the database. The plain key
 * is only shown once at creation time and never stored.
 */
@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate an API key and return the associated user context.
   *
   * @param apiKey - The plain-text API key from the `x-api-key` header
   * @returns RequestUser for the key owner
   * @throws UnauthorizedException if the key is invalid, expired, or the user/company is inactive
   */
  async validateApiKey(apiKey: string): Promise<RequestUser> {
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    const key = await this.prisma.client.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        company: { select: { id: true, isActive: true } },
      },
    });

    if (!key || !key.isActive) {
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    if (!key.user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    if (!key.company.isActive) {
      throw new UnauthorizedException('Company is inactive');
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Update lastUsedAt asynchronously (fire and forget — don't block the request)
    void this.prisma.client.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    // Get user role in company
    const companyUser = await this.prisma.client.companyUser.findUnique({
      where: {
        userId_companyId: {
          userId: key.userId,
          companyId: key.companyId,
        },
      },
    });

    return {
      userId: key.userId,
      email: key.user.email,
      companyId: key.companyId,
      role: companyUser?.role ?? 'member',
    };
  }
}
