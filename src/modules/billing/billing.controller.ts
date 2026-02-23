import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { BillingService } from './billing.service.js';
import { CreateSubscriptionDto } from './dto/create-subscription.dto.js';
import { Tenant } from '../../common/decorators/tenant.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /**
   * GET /api/v1/billing/plans
   *
   * List all active subscription plans.
   * This is a public endpoint — no authentication required.
   */
  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'List all active subscription plans' })
  @ApiResponse({ status: 200, description: 'List of active plans' })
  async getPlans() {
    const plans = await this.billingService.getPlans();
    return { success: true, data: plans };
  }

  /**
   * GET /api/v1/billing/subscriptions/current
   *
   * Get the current subscription for the authenticated tenant.
   */
  @Get('subscriptions/current')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current subscription for the tenant' })
  @ApiResponse({ status: 200, description: 'Current subscription details' })
  @ApiResponse({ status: 404, description: 'No subscription found' })
  async getCurrentSubscription(@Tenant() companyId: string) {
    const subscription =
      await this.billingService.getCurrentSubscription(companyId);
    return { success: true, data: subscription };
  }

  /**
   * POST /api/v1/billing/subscriptions
   *
   * Create a new subscription. Returns the Mercado Pago init_point URL
   * where the user should be redirected to complete the payment setup.
   */
  @Post('subscriptions')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new subscription (returns Mercado Pago payment URL)',
  })
  @ApiResponse({
    status: 201,
    description: 'Subscription created, redirect user to initPoint URL',
  })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  @ApiResponse({ status: 409, description: 'Active subscription already exists' })
  async createSubscription(
    @Tenant() companyId: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    const result = await this.billingService.createSubscription(
      companyId,
      dto,
    );
    return { success: true, data: result };
  }

  /**
   * POST /api/v1/billing/webhook
   *
   * Handle Mercado Pago IPN (Instant Payment Notification).
   * This is a public endpoint — Mercado Pago calls it directly.
   *
   * Always responds 200 OK to acknowledge receipt, even if
   * processing fails internally (to prevent MP from retrying endlessly).
   */
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mercado Pago IPN webhook (internal)' })
  @ApiResponse({ status: 200, description: 'Webhook acknowledged' })
  async handleWebhook(
    @Body() body: any,
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
  ) {
    try {
      this.billingService.verifyWebhookSignature(
        body?.data?.id,
        xSignature,
        xRequestId,
      );
      await this.billingService.handleWebhook(body);
    } catch (error: any) {
      // Always return 200 to MP to prevent endless retries.
      // Log the error for monitoring but never throw.
      this.logger.error(
        `Webhook processing error: ${error.message}`,
        error.stack,
      );
    }

    return { success: true };
  }
}
