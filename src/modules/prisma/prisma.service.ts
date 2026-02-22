import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { ClsService } from 'nestjs-cls';

/** Transaction client type — PrismaClient without lifecycle methods */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * PrismaService — Wraps Prisma 7 PrismaClient with PrismaPg driver adapter.
 *
 * Features:
 * - Automatic connect/disconnect on module lifecycle
 * - Tenant-scoped transactions via CLS (AsyncLocalStorage) for RLS
 * - SQL injection-safe tenant context using parameterized queries
 *
 * Usage in services:
 *   // Direct access (no RLS filtering):
 *   this.prisma.client.user.findMany()
 *
 *   // Tenant-scoped transaction (sets SET LOCAL tenancy.tenant_id for RLS):
 *   this.prisma.withTenant(async (tx) => {
 *     return tx.invoice.findMany();
 *   })
 *
 *   // Or explicitly pass a tenantId:
 *   this.prisma.withTenant(async (tx) => {
 *     return tx.invoice.findMany();
 *   }, 'specific-tenant-id')
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public readonly client: PrismaClient;

  constructor(
    private readonly cls: ClsService,
    private readonly config: ConfigService,
  ) {
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    const adapter = new PrismaPg({ connectionString });

    this.client = new PrismaClient({
      adapter,
      log:
        this.config.get<string>('NODE_ENV') === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Prisma connected to PostgreSQL via PrismaPg adapter');

    // Log slow queries in development
    if (this.config.get<string>('NODE_ENV') === 'development') {
      (this.client as any).$on?.('query', (event: any) => {
        if (event.duration > 200) {
          this.logger.warn(
            `Slow query (${event.duration}ms): ${event.query}`,
          );
        }
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
    this.logger.log('Prisma disconnected from PostgreSQL');
  }

  /**
   * Execute a callback within a tenant-scoped transaction.
   *
   * Sets `SET LOCAL tenancy.tenant_id` at the beginning of the transaction
   * so PostgreSQL RLS policies can filter rows automatically.
   *
   * SET LOCAL scopes the setting to the current transaction only,
   * which is safe for concurrent requests.
   *
   * @param fn - Callback receiving a transactional PrismaClient
   * @param tenantId - Optional explicit tenant ID. Defaults to CLS tenantId.
   * @returns The result of the callback
   * @throws Error if no tenantId is available
   */
  async withTenant<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    tenantId?: string,
  ): Promise<T> {
    const resolvedTenantId = tenantId ?? this.cls.get('tenantId');

    if (!resolvedTenantId) {
      throw new Error(
        'No tenant ID available. Ensure the request passes through TenantMiddleware or provide an explicit tenantId.',
      );
    }

    return this.client.$transaction(async (tx) => {
      // Use parameterized query to prevent SQL injection
      await (tx as any).$executeRawUnsafe(
        `SET LOCAL tenancy.tenant_id = $1`,
        resolvedTenantId,
      );
      return fn(tx as unknown as TransactionClient);
    });
  }

  /**
   * Execute a callback within a transaction WITHOUT tenant scoping.
   *
   * Use this for operations that should bypass RLS, such as:
   * - User registration (no tenant yet)
   * - Admin operations across tenants
   * - Authentication lookups
   *
   * @param fn - Callback receiving a transactional PrismaClient
   * @returns The result of the callback
   */
  async withTransaction<T>(
    fn: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      return fn(tx as unknown as TransactionClient);
    });
  }

  /**
   * Get the current tenant ID from CLS context.
   * Returns undefined if not in a tenant-scoped request.
   */
  get currentTenantId(): string | undefined {
    return this.cls.get('tenantId');
  }

  /**
   * Health check — verifies database connectivity.
   * Used by health check endpoints.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.$executeRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
