import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSubscriptionDto } from './dto/create-subscription.dto.js';

/** Shape returned by getPlans() */
export interface PlanResponse {
  id: string;
  name: string;
  slug: string;
  priceMonthly: number;
  maxInvoices: number;
  maxCompanies: number;
  features: Record<string, unknown>;
}

/** Shape returned by getCurrentSubscription() */
export interface SubscriptionResponse {
  id: string;
  companyId: string;
  plan: PlanResponse;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  invoicesUsed: number;
  createdAt: string;
}

/** Shape returned by createSubscription() */
export interface CreateSubscriptionResponse {
  subscriptionId: string;
  initPoint: string;
  status: string;
}

/** Shape returned by checkQuota() */
export interface QuotaResult {
  allowed: boolean;
  used: number;
  max: number;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly preapproval: PreApproval;
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const accessToken = this.configService.get<string>(
      'mercadopago.accessToken',
      '',
    );

    if (!accessToken) {
      this.logger.warn(
        'MP_ACCESS_TOKEN not configured — Mercado Pago integration will fail',
      );
    }

    const client = new MercadoPagoConfig({
      accessToken: accessToken || 'PLACEHOLDER',
    });
    this.preapproval = new PreApproval(client);

    this.webhookSecret = this.configService.get<string>(
      'mercadopago.webhookSecret',
      '',
    );
  }

  /**
   * Get all active plans, ordered by price ascending.
   */
  async getPlans(): Promise<PlanResponse[]> {
    const plans = await this.prisma.client.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });

    return plans.map((plan: any) => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      priceMonthly: Number(plan.priceMonthly),
      maxInvoices: plan.maxInvoices,
      maxCompanies: plan.maxCompanies,
      features: plan.features as Record<string, unknown>,
    }));
  }

  /**
   * Get the current subscription for a company, including its plan details.
   *
   * @throws NotFoundException if no subscription exists for the company
   */
  async getCurrentSubscription(
    companyId: string,
  ): Promise<SubscriptionResponse> {
    const subscription = await this.prisma.client.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException(
        'No subscription found for this company. Subscribe to a plan first.',
      );
    }

    return {
      id: subscription.id,
      companyId: subscription.companyId,
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        priceMonthly: Number(subscription.plan.priceMonthly),
        maxInvoices: subscription.plan.maxInvoices,
        maxCompanies: subscription.plan.maxCompanies,
        features: subscription.plan.features as Record<string, unknown>,
      },
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      invoicesUsed: subscription.invoicesUsed,
      createdAt: subscription.createdAt.toISOString(),
    };
  }

  /**
   * Create a new subscription for a company via Mercado Pago PreApproval.
   *
   * Returns the init_point URL where the user should be redirected to
   * complete the payment setup in Mercado Pago.
   *
   * @throws NotFoundException if the plan does not exist
   * @throws ConflictException if the company already has an active subscription
   * @throws BadRequestException if Mercado Pago fails to create the preapproval
   */
  async createSubscription(
    companyId: string,
    dto: CreateSubscriptionDto,
  ): Promise<CreateSubscriptionResponse> {
    // 1. Validate the plan exists and is active
    const plan = await this.prisma.client.plan.findUnique({
      where: { slug: dto.planSlug },
    });

    if (!plan || !plan.isActive) {
      throw new NotFoundException(
        `Plan '${dto.planSlug}' not found or is no longer active`,
      );
    }

    // 2. Check for existing active subscription
    const existing = await this.prisma.client.subscription.findUnique({
      where: { companyId },
    });

    if (existing && existing.status === 'active') {
      throw new ConflictException(
        'Company already has an active subscription. Cancel the current one before subscribing to a new plan.',
      );
    }

    // 3. Get the company for context (payer info)
    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // 4. Create Mercado Pago PreApproval (recurring subscription)
    const backUrl =
      dto.backUrl || 'https://app.facturape.com/billing';

    let mpResult: any;
    try {
      mpResult = await this.preapproval.create({
        body: {
          reason: `FacturaPE - Plan ${plan.name}`,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: Number(plan.priceMonthly),
            currency_id: 'PEN',
          },
          back_url: backUrl,
          external_reference: companyId,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Mercado Pago PreApproval creation failed: ${error.message}`,
      );
      throw new BadRequestException(
        'Failed to create payment subscription. Please try again later.',
      );
    }

    if (!mpResult?.id || !mpResult?.init_point) {
      this.logger.error(
        `Mercado Pago returned unexpected response: ${JSON.stringify(mpResult)}`,
      );
      throw new BadRequestException(
        'Unexpected response from payment provider. Please try again later.',
      );
    }

    // 5. Save subscription to database
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // If there was a cancelled/paused subscription, update it; otherwise create new
    const subscription = existing
      ? await this.prisma.client.subscription.update({
          where: { companyId },
          data: {
            planId: plan.id,
            mpPreapprovalId: String(mpResult.id),
            status: 'pending',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            invoicesUsed: 0,
          },
        })
      : await this.prisma.client.subscription.create({
          data: {
            companyId,
            planId: plan.id,
            mpPreapprovalId: String(mpResult.id),
            status: 'pending',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            invoicesUsed: 0,
          },
        });

    this.logger.log(
      `Subscription created for company ${companyId}: plan=${plan.slug} mpId=${mpResult.id}`,
    );

    return {
      subscriptionId: subscription.id,
      initPoint: mpResult.init_point as string,
      status: subscription.status,
    };
  }

  /**
   * Verify the HMAC-SHA256 signature sent by Mercado Pago in webhook requests.
   *
   * MP sends `x-signature: ts=<ts>,v1=<hash>` where the hash is
   * HMAC-SHA256 of `id:<dataId>;request-id:<requestId>;ts:<ts>;`
   *
   * @throws UnauthorizedException if signature is missing, invalid, or secret is not configured
   */
  verifyWebhookSignature(
    dataId: string | undefined,
    xSignature: string | undefined,
    xRequestId: string | undefined,
  ): void {
    if (!this.webhookSecret) {
      throw new UnauthorizedException(
        'MP_WEBHOOK_SECRET not configured — cannot verify webhook signature',
      );
    }

    if (!xSignature) {
      throw new UnauthorizedException('Missing x-signature header');
    }

    // Parse x-signature: "ts=1234567890,v1=abc123..."
    const parts: Record<string, string> = {};
    for (const part of xSignature.split(',')) {
      const [key, ...valueParts] = part.split('=');
      if (key && valueParts.length > 0) {
        parts[key.trim()] = valueParts.join('=').trim();
      }
    }

    const ts = parts['ts'];
    const v1 = parts['v1'];

    if (!ts || !v1) {
      throw new UnauthorizedException('Invalid x-signature format');
    }

    // Build the manifest string per MP docs
    const manifest = `id:${dataId ?? ''};request-id:${xRequestId ?? ''};ts:${ts};`;
    const expectedHash = createHmac('sha256', this.webhookSecret)
      .update(manifest)
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    const receivedBuf = Buffer.from(v1, 'hex');

    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  /**
   * Handle Mercado Pago IPN (Instant Payment Notification) webhook.
   *
   * Mercado Pago sends notifications for subscription lifecycle events.
   * We look up the preapproval by its ID and update the local subscription
   * status accordingly.
   *
   * @see https://www.mercadopago.com.pe/developers/es/docs/subscriptions/additional-content/your-integrations/notifications
   */
  async handleWebhook(body: any): Promise<void> {
    const { type, data } = body;

    this.logger.log(
      `Webhook received: type=${type} data=${JSON.stringify(data)}`,
    );

    // We only care about subscription_preapproval events
    if (type !== 'subscription_preapproval') {
      this.logger.debug(`Ignoring webhook type: ${type}`);
      return;
    }

    const preapprovalId = data?.id;
    if (!preapprovalId) {
      this.logger.warn('Webhook missing data.id — ignoring');
      return;
    }

    // Fetch the preapproval status from Mercado Pago
    let mpPreapproval: any;
    try {
      mpPreapproval = await this.preapproval.get({
        id: String(preapprovalId),
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch preapproval ${preapprovalId} from MP: ${error.message}`,
      );
      return;
    }

    if (!mpPreapproval) {
      this.logger.warn(
        `PreApproval ${preapprovalId} not found in Mercado Pago`,
      );
      return;
    }

    // Find our local subscription by the MP preapproval ID
    const subscription = await this.prisma.client.subscription.findFirst({
      where: { mpPreapprovalId: String(preapprovalId) },
    });

    if (!subscription) {
      this.logger.warn(
        `No local subscription found for MP preapproval ${preapprovalId}`,
      );
      return;
    }

    // Map Mercado Pago status to our internal status
    const mpStatus: string = mpPreapproval.status ?? '';
    const newStatus = this.mapMpStatus(mpStatus);

    // Update subscription status and period dates
    const updateData: Record<string, any> = {
      status: newStatus,
    };

    // If the subscription is now active, update period dates
    if (newStatus === 'active') {
      const nextPaymentDate = mpPreapproval.next_payment_date
        ? new Date(mpPreapproval.next_payment_date as string)
        : undefined;

      if (nextPaymentDate) {
        const periodStart = new Date(nextPaymentDate);
        periodStart.setMonth(periodStart.getMonth() - 1);
        updateData.currentPeriodStart = periodStart;
        updateData.currentPeriodEnd = nextPaymentDate;
      }

      // Reset invoice counter on new period activation
      updateData.invoicesUsed = 0;
    }

    await this.prisma.client.subscription.update({
      where: { id: subscription.id },
      data: updateData,
    });

    this.logger.log(
      `Subscription ${subscription.id} updated: mpStatus=${mpStatus} → status=${newStatus}`,
    );
  }

  /**
   * Check whether a company still has invoices available in their current
   * billing period.
   *
   * If no subscription exists, we deny access (allowed: false).
   */
  async checkQuota(companyId: string): Promise<QuotaResult> {
    const subscription = await this.prisma.client.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });

    if (!subscription || subscription.status !== 'active') {
      return { allowed: false, used: 0, max: 0 };
    }

    // Check if period has expired and needs resetting.
    // Use optimistic locking (WHERE currentPeriodEnd matches) to prevent
    // concurrent requests from both resetting the counter.
    const now = new Date();
    if (now > subscription.currentPeriodEnd) {
      const newPeriodStart = new Date(subscription.currentPeriodEnd);
      const newPeriodEnd = new Date(newPeriodStart);
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

      const { count } = await this.prisma.client.subscription.updateMany({
        where: {
          id: subscription.id,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
        data: {
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          invoicesUsed: 0,
        },
      });

      if (count === 0) {
        // Another request already reset the period — re-read fresh state
        return this.checkQuota(companyId);
      }

      return {
        allowed: true,
        used: 0,
        max: subscription.plan.maxInvoices,
      };
    }

    const allowed =
      subscription.invoicesUsed < subscription.plan.maxInvoices;

    return {
      allowed,
      used: subscription.invoicesUsed,
      max: subscription.plan.maxInvoices,
    };
  }

  /**
   * Increment the invoice counter for the current billing period.
   *
   * Call this after a successful invoice creation.
   *
   * @throws NotFoundException if no active subscription exists for the company
   */
  async incrementInvoiceCount(companyId: string): Promise<void> {
    const subscription = await this.prisma.client.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      this.logger.warn(
        `Cannot increment invoice count: no subscription for company ${companyId}`,
      );
      return;
    }

    await this.prisma.client.subscription.update({
      where: { id: subscription.id },
      data: {
        invoicesUsed: { increment: 1 },
      },
    });

    this.logger.debug(
      `Invoice count incremented for company ${companyId}: ${subscription.invoicesUsed + 1}`,
    );
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Map Mercado Pago subscription status to our internal status.
   *
   * MP statuses: authorized, paused, cancelled, pending
   * Our statuses: active, paused, cancelled
   */
  private mapMpStatus(mpStatus: string): string {
    switch (mpStatus) {
      case 'authorized':
        return 'active';
      case 'paused':
        return 'paused';
      case 'cancelled':
        return 'cancelled';
      case 'pending':
        return 'pending';
      default:
        this.logger.warn(`Unknown MP preapproval status: ${mpStatus}`);
        return 'pending';
    }
  }
}
