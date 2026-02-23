import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom ThrottlerGuard that tracks rate limits per tenant (companyId)
 * instead of per IP address.
 *
 * - Authenticated requests: limited per companyId (from JWT/API key)
 * - Unauthenticated requests: limited per IP (fallback)
 *
 * This ensures that a single tenant can't monopolize the API,
 * while different tenants get independent rate limit buckets.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // If the user is authenticated and has a companyId, use it as the tracker
    const companyId = req.user?.companyId;
    if (companyId) {
      return `tenant:${companyId}`;
    }

    // Fallback to IP for unauthenticated requests (login, register, public)
    return req.ip ?? req.ips?.[0] ?? 'unknown';
  }
}
