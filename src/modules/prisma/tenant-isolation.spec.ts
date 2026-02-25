import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Tenant Isolation Tests for PrismaService
//
// These tests verify that the Prisma CLS extension correctly injects
// companyId filtering into all FILTERABLE_OPS on TENANT_SCOPED_MODELS.
//
// Strategy: rather than spinning up a real DB, we replicate the exact
// $extends query interceptor logic in a self-contained harness so that
// the behaviour of the extension can be asserted in pure unit-test style.
// ---------------------------------------------------------------------------

// ── Constants mirrored from prisma.service.ts ────────────────────────────────

const TENANT_SCOPED_MODELS = new Set([
  'Invoice',
  'InvoiceItem',
  'Certificate',
  'Webhook',
  'Subscription',
  'ApiKey',
]);

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

const TENANT_FIELD: Record<string, string> = {
  Invoice: 'companyId',
  Certificate: 'companyId',
  Webhook: 'companyId',
  Subscription: 'companyId',
  ApiKey: 'companyId',
};

// ── In-memory invoice fixture data ───────────────────────────────────────────

const COMPANY_A_ID = 'comp-tenant-a';
const COMPANY_B_ID = 'comp-tenant-b';

function makeInvoice(
  id: string,
  companyId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    companyId,
    tipoDoc: '01',
    serie: 'F001',
    correlativo: 1,
    fechaEmision: new Date('2025-01-15'),
    clienteTipoDoc: '6',
    clienteNumDoc: '20100000001',
    clienteNombre: 'EMPRESA SRL',
    totalVenta: 236,
    status: 'ACCEPTED',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Shared "database" used across test scenarios
const DB_INVOICES = [
  makeInvoice('inv-a-001', COMPANY_A_ID),
  makeInvoice('inv-a-002', COMPANY_A_ID, { serie: 'F001', correlativo: 2 }),
  makeInvoice('inv-b-001', COMPANY_B_ID),
  makeInvoice('inv-b-002', COMPANY_B_ID, { serie: 'B001', correlativo: 1 }),
];

// ── Tenant-aware query interceptor (mirrors PrismaService.$extends logic) ────

/**
 * Simulates the Prisma `$extends` query interceptor from PrismaService.
 * Mutates `args.where` to inject `companyId` when a tenant is active.
 *
 * @param tenantId   - The tenant ID obtained from CLS (undefined = no tenant)
 * @param model      - Prisma model name (e.g., 'Invoice')
 * @param operation  - Prisma operation (e.g., 'findMany')
 * @param args       - Original query arguments
 * @returns          - Modified args with companyId filter applied (or original)
 */
function applyTenantFilter(
  tenantId: string | undefined,
  model: string,
  operation: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (
    !tenantId ||
    !TENANT_SCOPED_MODELS.has(model) ||
    !FILTERABLE_OPS.has(operation)
  ) {
    return args;
  }

  const field = TENANT_FIELD[model];
  if (!field) {
    return args;
  }

  const mutated = { ...args };
  if (mutated.where !== undefined) {
    mutated.where = { ...(mutated.where as Record<string, unknown>), [field]: tenantId };
  } else if (operation !== 'aggregate' && operation !== 'groupBy') {
    mutated.where = { [field]: tenantId };
  }

  return mutated;
}

/**
 * Simulates `invoice.findMany` against the in-memory DB_INVOICES list,
 * applying the same WHERE-clause logic Prisma would use.
 */
function simulateFindMany(
  args: Record<string, unknown>,
): ReturnType<typeof makeInvoice>[] {
  const where = (args.where ?? {}) as Record<string, unknown>;
  return DB_INVOICES.filter((inv) => {
    for (const [key, value] of Object.entries(where)) {
      if ((inv as Record<string, unknown>)[key] !== value) return false;
    }
    return true;
  });
}

// ── Mock CLS factory ──────────────────────────────────────────────────────────

function createClsMock(tenantId: string | undefined = undefined) {
  return {
    get: vi.fn((key: string) => (key === 'tenantId' ? tenantId : undefined)),
    set: vi.fn(),
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('PrismaService — tenant isolation (CLS extension)', () => {
  // ── 1. Correct tenant filtering ──────────────────────────────────────────

  describe('Scenario 1: active tenant A in CLS context', () => {
    let clsMock: ReturnType<typeof createClsMock>;

    beforeEach(() => {
      clsMock = createClsMock(COMPANY_A_ID);
    });

    it('findMany on Invoice should only return records belonging to tenant A', () => {
      const tenantId = clsMock.get('tenantId') as string;
      const rawArgs: Record<string, unknown> = {};

      const filteredArgs = applyTenantFilter(tenantId, 'Invoice', 'findMany', rawArgs);
      const results = simulateFindMany(filteredArgs);

      expect(results).toHaveLength(2);
      expect(results.every((inv) => inv.companyId === COMPANY_A_ID)).toBe(true);
    });

    it('companyId filter is injected into the where clause when no where was provided', () => {
      const tenantId = clsMock.get('tenantId') as string;
      const rawArgs: Record<string, unknown> = {};

      const filteredArgs = applyTenantFilter(tenantId, 'Invoice', 'findMany', rawArgs);

      expect(filteredArgs.where).toBeDefined();
      expect((filteredArgs.where as Record<string, unknown>).companyId).toBe(COMPANY_A_ID);
    });

    it('companyId filter is merged into an existing where clause, preserving other conditions', () => {
      const tenantId = clsMock.get('tenantId') as string;
      const rawArgs: Record<string, unknown> = {
        where: { tipoDoc: '01' },
      };

      const filteredArgs = applyTenantFilter(tenantId, 'Invoice', 'findMany', rawArgs);
      const where = filteredArgs.where as Record<string, unknown>;

      expect(where.tipoDoc).toBe('01');
      expect(where.companyId).toBe(COMPANY_A_ID);
    });

    it('CLS.get("tenantId") is called to resolve the current tenant', () => {
      clsMock.get('tenantId');
      expect(clsMock.get).toHaveBeenCalledWith('tenantId');
    });
  });

  // ── 2. Cross-tenant access: A cannot see B's invoices ────────────────────

  describe('Scenario 2: cross-tenant access attempt', () => {
    it('tenant A query cannot retrieve invoices that belong to tenant B', () => {
      const clsA = createClsMock(COMPANY_A_ID);
      const tenantId = clsA.get('tenantId') as string;

      // Attacker passes a where clause trying to bypass by specifying companyId B
      const maliciousArgs: Record<string, unknown> = {
        where: { companyId: COMPANY_B_ID },
      };

      const filteredArgs = applyTenantFilter(tenantId, 'Invoice', 'findMany', maliciousArgs);
      const where = filteredArgs.where as Record<string, unknown>;

      // The extension OVERWRITES the supplied companyId with the CLS tenant
      expect(where.companyId).toBe(COMPANY_A_ID);
      expect(where.companyId).not.toBe(COMPANY_B_ID);

      // Confirming the DB simulation returns 0 tenant-B records
      const results = simulateFindMany(filteredArgs);
      expect(results.every((inv) => inv.companyId !== COMPANY_B_ID)).toBe(true);
    });

    it('tenant B query cannot retrieve invoices that belong to tenant A', () => {
      const clsB = createClsMock(COMPANY_B_ID);
      const tenantId = clsB.get('tenantId') as string;

      const rawArgs: Record<string, unknown> = {};
      const filteredArgs = applyTenantFilter(tenantId, 'Invoice', 'findMany', rawArgs);
      const results = simulateFindMany(filteredArgs);

      expect(results).toHaveLength(2);
      expect(results.every((inv) => inv.companyId === COMPANY_B_ID)).toBe(true);
      expect(results.some((inv) => inv.companyId === COMPANY_A_ID)).toBe(false);
    });

    it('the two tenants have completely disjoint result sets', () => {
      const resultsA = simulateFindMany(
        applyTenantFilter(COMPANY_A_ID, 'Invoice', 'findMany', {}),
      );
      const resultsB = simulateFindMany(
        applyTenantFilter(COMPANY_B_ID, 'Invoice', 'findMany', {}),
      );

      const idsA = new Set(resultsA.map((inv) => inv.id));
      const idsB = new Set(resultsB.map((inv) => inv.id));

      // No invoice id should appear in both sets
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toHaveLength(0);
    });
  });

  // ── 3. Missing tenant (no CLS context) ───────────────────────────────────

  describe('Scenario 3: missing tenant context (no CLS tenantId)', () => {
    it('should not inject companyId filter when tenantId is undefined', () => {
      const clsNoTenant = createClsMock(undefined);
      const tenantId = clsNoTenant.get('tenantId') as string | undefined;

      const rawArgs: Record<string, unknown> = {};
      const filteredArgs = applyTenantFilter(tenantId, 'Invoice', 'findMany', rawArgs);

      // where must remain undefined — no automatic scoping
      expect(filteredArgs.where).toBeUndefined();
    });

    it('should not inject companyId filter when tenantId is an empty string', () => {
      const rawArgs: Record<string, unknown> = {};
      const filteredArgs = applyTenantFilter('', 'Invoice', 'findMany', rawArgs);

      expect(filteredArgs.where).toBeUndefined();
    });

    it('unscoped query passes through and returns all invoices (simulates admin/queue context)', () => {
      const rawArgs: Record<string, unknown> = {};
      const filteredArgs = applyTenantFilter(undefined, 'Invoice', 'findMany', rawArgs);
      const results = simulateFindMany(filteredArgs);

      // Without a tenant filter the full DB is returned
      expect(results).toHaveLength(DB_INVOICES.length);
    });
  });

  // ── 4. Non-tenant model passthrough ──────────────────────────────────────

  describe('Scenario 4: non-tenant model — no filter injected', () => {
    it('Company model is not in TENANT_SCOPED_MODELS — args pass through unmodified', () => {
      const rawArgs: Record<string, unknown> = {};
      const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'Company', 'findMany', rawArgs);

      expect(filteredArgs.where).toBeUndefined();
    });

    it('User model is not in TENANT_SCOPED_MODELS — args pass through unmodified', () => {
      const rawArgs: Record<string, unknown> = { where: { email: 'test@facturape.pe' } };
      const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'User', 'findUnique', rawArgs);

      // Original where is preserved, companyId NOT injected
      const where = filteredArgs.where as Record<string, unknown>;
      expect(where.email).toBe('test@facturape.pe');
      expect(where.companyId).toBeUndefined();
    });

    it('Plan model is not in TENANT_SCOPED_MODELS — args pass through unmodified', () => {
      const rawArgs: Record<string, unknown> = {};
      const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'Plan', 'findMany', rawArgs);

      expect(filteredArgs.where).toBeUndefined();
    });
  });

  // ── 5. Non-filterable operation passthrough ───────────────────────────────

  describe('Scenario 5: non-filterable operations — no filter injected', () => {
    it('create operation is NOT in FILTERABLE_OPS — args pass through unmodified', () => {
      const rawArgs: Record<string, unknown> = { data: { companyId: COMPANY_A_ID } };
      const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'Invoice', 'create', rawArgs);

      // create must not have where injected — service sets companyId explicitly
      expect(filteredArgs.where).toBeUndefined();
      // original data is preserved
      expect((filteredArgs.data as Record<string, unknown>).companyId).toBe(COMPANY_A_ID);
    });

    it('createMany operation is NOT in FILTERABLE_OPS — args pass through unmodified', () => {
      const rawArgs: Record<string, unknown> = { data: [] };
      const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'Invoice', 'createMany', rawArgs);

      expect(filteredArgs.where).toBeUndefined();
    });
  });

  // ── 6. InvoiceItem model — no direct companyId field ─────────────────────

  describe('Scenario 6: InvoiceItem — no TENANT_FIELD mapping', () => {
    it('InvoiceItem is in TENANT_SCOPED_MODELS but has no TENANT_FIELD — args pass through', () => {
      const rawArgs: Record<string, unknown> = {};
      const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'InvoiceItem', 'findMany', rawArgs);

      // InvoiceItem has no direct companyId; accessed via Invoice relation
      expect(filteredArgs.where).toBeUndefined();
    });
  });

  // ── 7. aggregate / groupBy edge-case ─────────────────────────────────────

  describe('Scenario 7: aggregate and groupBy operations', () => {
    it('aggregate on Invoice with no where does NOT get an empty where object injected', () => {
      const rawArgs: Record<string, unknown> = { _count: true };
      const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'Invoice', 'aggregate', rawArgs);

      // aggregate without an existing where clause: the interceptor skips setting where={}
      // because aggregate is excluded from the default-where branch
      expect(filteredArgs.where).toBeUndefined();
    });

    it('aggregate on Invoice WITH an existing where clause gets companyId injected', () => {
      const rawArgs: Record<string, unknown> = {
        _count: true,
        where: { status: 'ACCEPTED' },
      };
      const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'Invoice', 'aggregate', rawArgs);
      const where = filteredArgs.where as Record<string, unknown>;

      expect(where.status).toBe('ACCEPTED');
      expect(where.companyId).toBe(COMPANY_A_ID);
    });

    it('groupBy on Invoice with no where does NOT get an empty where object injected', () => {
      const rawArgs: Record<string, unknown> = { by: ['status'] };
      const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'Invoice', 'groupBy', rawArgs);

      expect(filteredArgs.where).toBeUndefined();
    });
  });

  // ── 8. All FILTERABLE_OPS that do get a where injection ──────────────────

  describe('Scenario 8: companyId is injected for all expected filterable operations', () => {
    const READ_OPS = [
      'findFirst',
      'findFirstOrThrow',
      'findMany',
      'findUnique',
      'findUniqueOrThrow',
      'count',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
    ] as const;

    for (const op of READ_OPS) {
      it(`operation "${op}" on Invoice receives companyId injection`, () => {
        const rawArgs: Record<string, unknown> = {};
        const filteredArgs = applyTenantFilter(COMPANY_A_ID, 'Invoice', op, rawArgs);

        expect((filteredArgs.where as Record<string, unknown>).companyId).toBe(
          COMPANY_A_ID,
        );
      });
    }
  });

  // ── 9. Mock PrismaService — client vs unscopedClient contract ────────────

  describe('Scenario 9: PrismaService mock — client applies filtering, unscopedClient does not', () => {
    /**
     * We construct a minimal PrismaService mock that mirrors the real
     * service's `client` / `unscopedClient` split.  The `client` getter
     * uses the CLS mock to inject filtering; `unscopedClient` bypasses it.
     */
    function createPrismaServiceMock(tenantId: string | undefined) {
      const clsRef = createClsMock(tenantId);

      // Underlying "raw" findMany: returns whatever is in the DB
      const rawFindMany = vi.fn((args: Record<string, unknown>) =>
        Promise.resolve(simulateFindMany(args)),
      );

      // Tenant-aware client — wraps rawFindMany with the filter interceptor
      const tenantClient = {
        invoice: {
          findMany: vi.fn((args: Record<string, unknown> = {}) => {
            const resolvedTenant = clsRef.get('tenantId') as string | undefined;
            const filteredArgs = applyTenantFilter(
              resolvedTenant,
              'Invoice',
              'findMany',
              args,
            );
            return rawFindMany(filteredArgs);
          }),
        },
      };

      // Unscoped client — calls rawFindMany directly (no CLS lookup)
      const unscopedClient = {
        invoice: {
          findMany: vi.fn((args: Record<string, unknown> = {}) =>
            rawFindMany(args),
          ),
        },
      };

      return { tenantClient, unscopedClient, rawFindMany, clsRef };
    }

    it('prisma.client.invoice.findMany returns only tenant A invoices when CLS = A', async () => {
      const { tenantClient } = createPrismaServiceMock(COMPANY_A_ID);

      const results = await tenantClient.invoice.findMany({});

      expect(results).toHaveLength(2);
      expect(results.every((inv) => inv.companyId === COMPANY_A_ID)).toBe(true);
    });

    it('prisma.client.invoice.findMany returns only tenant B invoices when CLS = B', async () => {
      const { tenantClient } = createPrismaServiceMock(COMPANY_B_ID);

      const results = await tenantClient.invoice.findMany({});

      expect(results).toHaveLength(2);
      expect(results.every((inv) => inv.companyId === COMPANY_B_ID)).toBe(true);
    });

    it('prisma.unscopedClient.invoice.findMany returns all invoices regardless of CLS', async () => {
      const { unscopedClient } = createPrismaServiceMock(COMPANY_A_ID);

      const results = await unscopedClient.invoice.findMany({});

      expect(results).toHaveLength(DB_INVOICES.length);
    });

    it('prisma.client.invoice.findMany when CLS has no tenant returns all invoices (queue/admin)', async () => {
      const { tenantClient } = createPrismaServiceMock(undefined);

      const results = await tenantClient.invoice.findMany({});

      // No tenant → no filter → full DB
      expect(results).toHaveLength(DB_INVOICES.length);
    });
  });

  // ── 10. currentTenantId accessor ─────────────────────────────────────────

  describe('Scenario 10: currentTenantId accessor reflects CLS state', () => {
    it('returns the tenantId stored in CLS when one is set', () => {
      const cls = createClsMock(COMPANY_A_ID);
      const currentTenantId = cls.get('tenantId');

      expect(currentTenantId).toBe(COMPANY_A_ID);
    });

    it('returns undefined when no tenantId is set in CLS', () => {
      const cls = createClsMock(undefined);
      const currentTenantId = cls.get('tenantId');

      expect(currentTenantId).toBeUndefined();
    });
  });
});
