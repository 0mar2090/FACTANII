import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { BillingService } from './billing.service.js';

// ── Mock mercadopago BEFORE importing BillingService ─────────────────────────
// BillingService instantiates MercadoPagoConfig and PreApproval in its
// constructor. We mock the module so the constructor doesn't make real HTTP
// calls and so we can stub preapproval.create / preapproval.get per test.

const mockPreapprovalCreate = vi.fn();
const mockPreapprovalGet = vi.fn();

vi.mock('mercadopago', () => {
  return {
    MercadoPagoConfig: vi.fn().mockImplementation(() => ({})),
    PreApproval: vi.fn().mockImplementation(() => ({
      create: mockPreapprovalCreate,
      get: mockPreapprovalGet,
    })),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-001',
    name: 'Starter',
    slug: 'starter',
    priceMonthly: 49.9,
    maxInvoices: 100,
    maxCompanies: 1,
    features: { api: true },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  return {
    id: 'sub-001',
    companyId: 'comp-001',
    planId: 'plan-001',
    plan: makePlan(),
    mpPreapprovalId: 'mp-preapproval-001',
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: end,
    invoicesUsed: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comp-001',
    ruc: '20000000001',
    razonSocial: 'Test SAC',
    isActive: true,
    ...overrides,
  };
}

// ── Mock Factories ────────────────────────────────────────────────────────────

function createMocks() {
  const prisma = {
    client: {
      plan: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      subscription: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      company: {
        findUnique: vi.fn(),
      },
    },
  };

  const configService = {
    get: vi.fn((key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        'mercadopago.accessToken': 'TEST_MP_TOKEN',
        'mercadopago.webhookSecret': 'test-webhook-secret',
      };
      return values[key] ?? fallback;
    }),
  };

  return { prisma, configService };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new BillingService(mocks.prisma as any, mocks.configService as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BillingService', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: BillingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMocks();
    service = createService(mocks);
  });

  // ── getPlans ───────────────────────────────────────────────────────────────

  describe('getPlans', () => {
    it('should return a list of active plans ordered by price ascending', async () => {
      const plans = [
        makePlan({ slug: 'starter', priceMonthly: 49.9 }),
        makePlan({ id: 'plan-002', slug: 'pro', name: 'Pro', priceMonthly: 99.9, maxInvoices: 500 }),
      ];
      mocks.prisma.client.plan.findMany.mockResolvedValue(plans);

      const result = await service.getPlans();

      expect(result).toHaveLength(2);
      expect(result[0]!.slug).toBe('starter');
      expect(result[1]!.slug).toBe('pro');
      // Prices are returned as numbers (Decimal cast)
      expect(typeof result[0]!.priceMonthly).toBe('number');
      expect(result[0]!.priceMonthly).toBe(49.9);
    });

    it('should query only active plans sorted by price', async () => {
      mocks.prisma.client.plan.findMany.mockResolvedValue([]);

      await service.getPlans();

      expect(mocks.prisma.client.plan.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { priceMonthly: 'asc' },
      });
    });

    it('should return an empty array when there are no active plans', async () => {
      mocks.prisma.client.plan.findMany.mockResolvedValue([]);

      const result = await service.getPlans();

      expect(result).toEqual([]);
    });
  });

  // ── getCurrentSubscription ─────────────────────────────────────────────────

  describe('getCurrentSubscription', () => {
    it('should return the current subscription with plan details', async () => {
      const sub = makeSubscription();
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(sub);

      const result = await service.getCurrentSubscription('comp-001');

      expect(result.id).toBe('sub-001');
      expect(result.companyId).toBe('comp-001');
      expect(result.status).toBe('active');
      expect(result.invoicesUsed).toBe(10);
      expect(result.plan.slug).toBe('starter');
      expect(result.plan.maxInvoices).toBe(100);
      // ISO string dates
      expect(typeof result.currentPeriodStart).toBe('string');
      expect(typeof result.currentPeriodEnd).toBe('string');
      expect(typeof result.createdAt).toBe('string');
    });

    it('should throw NotFoundException when no subscription exists for the company', async () => {
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(null);

      await expect(
        service.getCurrentSubscription('comp-001'),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.getCurrentSubscription('comp-001'),
      ).rejects.toThrow(/subscribe to a plan/i);
    });
  });

  // ── checkQuota ─────────────────────────────────────────────────────────────

  describe('checkQuota', () => {
    it('should return allowed=true when invoicesUsed is under the plan limit', async () => {
      const sub = makeSubscription({ invoicesUsed: 50, plan: makePlan({ maxInvoices: 100 }) });
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(sub);

      const result = await service.checkQuota('comp-001');

      expect(result.allowed).toBe(true);
      expect(result.used).toBe(50);
      expect(result.max).toBe(100);
    });

    it('should return allowed=false when invoicesUsed has reached the plan limit', async () => {
      const sub = makeSubscription({ invoicesUsed: 100, plan: makePlan({ maxInvoices: 100 }) });
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(sub);

      const result = await service.checkQuota('comp-001');

      expect(result.allowed).toBe(false);
      expect(result.used).toBe(100);
      expect(result.max).toBe(100);
    });

    it('should return allowed=false when no subscription exists', async () => {
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(null);

      const result = await service.checkQuota('comp-001');

      expect(result.allowed).toBe(false);
      expect(result.used).toBe(0);
      expect(result.max).toBe(0);
    });

    it('should return allowed=false when subscription status is not active', async () => {
      const sub = makeSubscription({ status: 'paused' });
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(sub);

      const result = await service.checkQuota('comp-001');

      expect(result.allowed).toBe(false);
    });

    it('should reset the period and return allowed=true when the billing period has expired', async () => {
      const pastEnd = new Date();
      pastEnd.setMonth(pastEnd.getMonth() - 1); // period ended last month
      const sub = makeSubscription({
        invoicesUsed: 80,
        currentPeriodEnd: pastEnd,
        plan: makePlan({ maxInvoices: 100 }),
      });
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(sub);
      // Simulate successful optimistic period reset (count=1)
      mocks.prisma.client.subscription.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.checkQuota('comp-001');

      expect(result.allowed).toBe(true);
      expect(result.used).toBe(0);
      expect(result.max).toBe(100);
      expect(mocks.prisma.client.subscription.updateMany).toHaveBeenCalledOnce();
    });
  });

  // ── incrementInvoiceCount ──────────────────────────────────────────────────

  describe('incrementInvoiceCount', () => {
    it('should increment invoicesUsed by 1 for the active subscription', async () => {
      const sub = makeSubscription({ invoicesUsed: 10 });
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(sub);
      mocks.prisma.client.subscription.update.mockResolvedValue({
        ...sub,
        invoicesUsed: 11,
      });

      await service.incrementInvoiceCount('comp-001');

      expect(mocks.prisma.client.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-001' },
        data: { invoicesUsed: { increment: 1 } },
      });
    });

    it('should do nothing (and not throw) when there is no subscription', async () => {
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(null);

      await expect(
        service.incrementInvoiceCount('comp-001'),
      ).resolves.not.toThrow();

      expect(mocks.prisma.client.subscription.update).not.toHaveBeenCalled();
    });
  });

  // ── createSubscription ─────────────────────────────────────────────────────

  describe('createSubscription', () => {
    it('should create a new subscription and return the MP init_point', async () => {
      const plan = makePlan();
      mocks.prisma.client.plan.findUnique.mockResolvedValue(plan);
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(null);
      mocks.prisma.client.company.findUnique.mockResolvedValue(makeCompany());
      mockPreapprovalCreate.mockResolvedValue({
        id: 'mp-pre-123',
        init_point: 'https://mp.com/checkout/mp-pre-123',
        status: 'pending',
      });
      mocks.prisma.client.subscription.create.mockResolvedValue({
        id: 'sub-new',
        status: 'pending',
        companyId: 'comp-001',
      });

      const result = await service.createSubscription('comp-001', {
        planSlug: 'starter',
      });

      expect(result.initPoint).toBe('https://mp.com/checkout/mp-pre-123');
      expect(result.status).toBe('pending');
      expect(result.subscriptionId).toBe('sub-new');
    });

    it('should throw NotFoundException when the plan slug does not exist', async () => {
      mocks.prisma.client.plan.findUnique.mockResolvedValue(null);

      await expect(
        service.createSubscription('comp-001', { planSlug: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.createSubscription('comp-001', { planSlug: 'nonexistent' }),
      ).rejects.toThrow(/not found/i);
    });

    it('should throw ConflictException when the company already has an active subscription', async () => {
      mocks.prisma.client.plan.findUnique.mockResolvedValue(makePlan());
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(
        makeSubscription({ status: 'active' }),
      );

      await expect(
        service.createSubscription('comp-001', { planSlug: 'starter' }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.createSubscription('comp-001', { planSlug: 'starter' }),
      ).rejects.toThrow(/already has an active subscription/i);
    });

    it('should throw BadRequestException when Mercado Pago returns an error', async () => {
      mocks.prisma.client.plan.findUnique.mockResolvedValue(makePlan());
      mocks.prisma.client.subscription.findUnique.mockResolvedValue(null);
      mocks.prisma.client.company.findUnique.mockResolvedValue(makeCompany());
      mockPreapprovalCreate.mockRejectedValue(new Error('MP API error'));

      await expect(
        service.createSubscription('comp-001', { planSlug: 'starter' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createSubscription('comp-001', { planSlug: 'starter' }),
      ).rejects.toThrow(/Failed to create payment subscription/i);
    });
  });

  // ── verifyWebhookSignature ─────────────────────────────────────────────────

  describe('verifyWebhookSignature', () => {
    it('should not throw for a valid HMAC-SHA256 signature', () => {
      // Build a valid signature using the same logic as the service
      const { createHmac } = require('node:crypto');
      const secret = 'test-webhook-secret';
      const dataId = 'event-data-id';
      const requestId = 'request-id-123';
      const ts = '1234567890';
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const hash = createHmac('sha256', secret).update(manifest).digest('hex');
      const xSignature = `ts=${ts},v1=${hash}`;

      expect(() =>
        service.verifyWebhookSignature(dataId, xSignature, requestId),
      ).not.toThrow();
    });

    it('should throw UnauthorizedException when the signature is missing', () => {
      expect(() =>
        service.verifyWebhookSignature('event-id', undefined, 'req-id'),
      ).toThrow(UnauthorizedException);

      expect(() =>
        service.verifyWebhookSignature('event-id', undefined, 'req-id'),
      ).toThrow('Missing x-signature header');
    });

    it('should throw UnauthorizedException when the signature does not match', () => {
      const badSignature = 'ts=1234567890,v1=badhashbadhash00000000000000000000000000000000000000000000000000';

      expect(() =>
        service.verifyWebhookSignature('event-id', badSignature, 'req-id'),
      ).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when x-signature format is invalid', () => {
      expect(() =>
        service.verifyWebhookSignature('event-id', 'malformed-header', 'req-id'),
      ).toThrow(UnauthorizedException);

      expect(() =>
        service.verifyWebhookSignature('event-id', 'malformed-header', 'req-id'),
      ).toThrow('Invalid x-signature format');
    });
  });

  // ── handleWebhook ──────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    it('should update subscription status to active when MP reports authorized', async () => {
      const sub = makeSubscription({ status: 'pending', mpPreapprovalId: 'mp-pre-001' });
      mocks.prisma.client.subscription.findFirst.mockResolvedValue(sub);
      mocks.prisma.client.subscription.update.mockResolvedValue({
        ...sub,
        status: 'active',
      });
      mockPreapprovalGet.mockResolvedValue({
        id: 'mp-pre-001',
        status: 'authorized',
        next_payment_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      await service.handleWebhook({
        type: 'subscription_preapproval',
        data: { id: 'mp-pre-001' },
      });

      expect(mocks.prisma.client.subscription.update).toHaveBeenCalledOnce();
      const updateArg = mocks.prisma.client.subscription.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('active');
      // Invoice counter should reset on activation
      expect(updateArg.data.invoicesUsed).toBe(0);
    });

    it('should silently ignore webhook events that are not subscription_preapproval type', async () => {
      await service.handleWebhook({
        type: 'payment',
        data: { id: 'payment-001' },
      });

      expect(mockPreapprovalGet).not.toHaveBeenCalled();
      expect(mocks.prisma.client.subscription.update).not.toHaveBeenCalled();
    });

    it('should update subscription status to cancelled when MP reports cancelled', async () => {
      const sub = makeSubscription({ status: 'active', mpPreapprovalId: 'mp-pre-002' });
      mocks.prisma.client.subscription.findFirst.mockResolvedValue(sub);
      mocks.prisma.client.subscription.update.mockResolvedValue({
        ...sub,
        status: 'cancelled',
      });
      mockPreapprovalGet.mockResolvedValue({
        id: 'mp-pre-002',
        status: 'cancelled',
      });

      await service.handleWebhook({
        type: 'subscription_preapproval',
        data: { id: 'mp-pre-002' },
      });

      const updateArg = mocks.prisma.client.subscription.update.mock.calls[0][0];
      expect(updateArg.data.status).toBe('cancelled');
    });
  });
});
