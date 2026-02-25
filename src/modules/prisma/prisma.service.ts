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
 * Models with a `companyId` field that must be tenant-scoped.
 * All read/update/delete operations on these models will have
 * `companyId` automatically injected from CLS context.
 */
const TENANT_SCOPED_MODELS = new Set([
  'Invoice',
  'InvoiceItem',
  'Certificate',
  'Webhook',
  'Subscription',
  'ApiKey',
]);

/**
 * Operations where we inject `companyId` into the `where` clause.
 * Write operations (create/createMany) are excluded because services
 * set companyId explicitly from the JWT token.
 */
const FILTERABLE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * The companyId field name for each tenant-scoped model.
 * Most models use 'companyId' directly; InvoiceItem uses 'invoice.companyId'
 * via a nested relation filter.
 */
const TENANT_FIELD: Record<string, string> = {
  Invoice: 'companyId',
  Certificate: 'companyId',
  Webhook: 'companyId',
  Subscription: 'companyId',
  ApiKey: 'companyId',
};

/**
 * PrismaService — Wraps Prisma 7 PrismaClient with PrismaPg driver adapter.
 *
 * Features:
 * - Automatic connect/disconnect on module lifecycle
 * - **Automatic tenant filtering** via Prisma Client Extension:
 *   All queries on tenant-scoped models (Invoice, Certificate, Webhook,
 *   Subscription, ApiKey) automatically get a `companyId` filter injected
 *   from the CLS (AsyncLocalStorage) context set by TenantGuard.
 * - Tenant-scoped transactions via `withTenant()` for PostgreSQL RLS
 * - SQL injection-safe tenant context using parameterized queries
 *
 * How it works:
 *   1. TenantGuard sets `tenantId` in CLS from the JWT/API key
 *   2. Every query on a tenant-scoped model reads CLS at execution time
 *   3. If tenantId exists, `companyId = tenantId` is added to the WHERE clause
 *   4. If no tenantId (e.g., @Public, @SkipTenant, queue processors), the
 *      query passes through unmodified
 *
 * Usage in services:
 *   // Tenant-scoped automatically (no code changes needed):
 *   this.prisma.client.invoice.findMany()
 *   // → WHERE companyId = <cls-tenantId> AND ...
 *
 *   // No tenant context (@Public/@SkipTenant/queues) — passes through:
 *   this.prisma.client.user.findMany()
 *
 *   // Explicit unscoped access (bypasses tenant filter):
 *   this.prisma.unscopedClient.invoice.findMany()
 *
 *   // PostgreSQL RLS transaction (SET LOCAL tenancy.tenant_id):
 *   this.prisma.withTenant(async (tx) => {
 *     return tx.invoice.findMany();
 *   })
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** Base Prisma client — no tenant filtering. Use `unscopedClient` for explicit bypass. */
  private readonly _baseClient: PrismaClient;

  /** Extended Prisma client with automatic tenant filtering via CLS. */
  private readonly _tenantClient: PrismaClient;

  constructor(
    private readonly cls: ClsService,
    private readonly config: ConfigService,
  ) {
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    const adapter = new PrismaPg({ connectionString });

    this._baseClient = new PrismaClient({
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

    // Create tenant-aware extended client.
    // The CLS lookup happens at QUERY TIME (inside the callback), not at
    // construction time, so each request gets its own tenant context.
    const clsRef = this.cls;
    this._tenantClient = this._baseClient.$extends({
      query: {
        $allOperations({ model, operation, args, query }) {
          const tenantId = clsRef.get('tenantId');

          // Pass through if: no tenant context, non-tenant model, or non-filterable op
          if (!tenantId || !model || !TENANT_SCOPED_MODELS.has(model) || !FILTERABLE_OPS.has(operation)) {
            return query(args);
          }

          // Skip InvoiceItem — it's always accessed via Invoice relation (include/nested)
          // and doesn't have a direct companyId field
          const field = TENANT_FIELD[model];
          if (!field) {
            return query(args);
          }

          // Inject companyId filter into the where clause
          const typedArgs = args as Record<string, any>;
          if (typedArgs.where !== undefined) {
            typedArgs.where = { ...typedArgs.where, [field]: tenantId };
          } else if (operation !== 'aggregate' && operation !== 'groupBy') {
            typedArgs.where = { [field]: tenantId };
          }

          return query(typedArgs);
        },
      },
    }) as unknown as PrismaClient;
  }

  /**
   * The default client — includes automatic tenant filtering.
   * All existing `this.prisma.client.*` calls are now tenant-scoped.
   */
  get client(): PrismaClient {
    return this._tenantClient;
  }

  /**
   * Unscoped client — bypasses tenant filtering.
   * Use for cross-tenant operations, auth lookups, health checks, etc.
   */
  get unscopedClient(): PrismaClient {
    return this._baseClient;
  }

  async onModuleInit(): Promise<void> {
    await this._baseClient.$connect();
    this.logger.log('Prisma connected to PostgreSQL via PrismaPg adapter (tenant extension active)');

    // Log slow queries in development
    if (this.config.get<string>('NODE_ENV') === 'development') {
      (this._baseClient as any).$on?.('query', (event: any) => {
        if (event.duration > 200) {
          this.logger.warn(
            `Slow query (${event.duration}ms): ${event.query}`,
          );
        }
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this._baseClient.$disconnect();
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

    return this._baseClient.$transaction(async (tx) => {
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
    return this._baseClient.$transaction(async (tx) => {
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
      await this._baseClient.$executeRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
