import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { WebhookEvent, WebhookPayload, CreateWebhookDto } from './dto/webhook.dto.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a webhook endpoint for a company.
   */
  async create(companyId: string, dto: CreateWebhookDto) {
    const webhook = await this.prisma.client.webhook.create({
      data: {
        companyId,
        url: dto.url,
        events: dto.events,
        secret: dto.secret,
      },
    });

    this.logger.log(
      `Webhook created: id=${webhook.id} company=${companyId} url=${dto.url} events=[${dto.events.join(', ')}]`,
    );

    return webhook;
  }

  /**
   * List all active webhooks for a company.
   */
  async findAll(companyId: string) {
    return this.prisma.client.webhook.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Deactivate a webhook (soft delete).
   */
  async remove(companyId: string, webhookId: string) {
    const webhook = await this.prisma.client.webhook.findFirst({
      where: { id: webhookId, companyId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    await this.prisma.client.webhook.update({
      where: { id: webhookId },
      data: { isActive: false },
    });

    this.logger.log(`Webhook deactivated: id=${webhookId} company=${companyId}`);
  }

  /**
   * Send a webhook notification to a URL.
   */
  async sendWebhook(
    url: string,
    payload: WebhookPayload,
    secret?: string | null,
  ): Promise<boolean> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': payload.timestamp,
    };

    if (secret) {
      const signature = createHmac('sha256', secret)
        .update(body)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (response.ok) {
        this.logger.log(
          `Webhook delivered: event=${payload.event} url=${url} status=${response.status}`,
        );
        return true;
      }

      this.logger.warn(
        `Webhook rejected: event=${payload.event} url=${url} status=${response.status}`,
      );
      return false;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        this.logger.error(
          `Webhook timeout: event=${payload.event} url=${url} (10s exceeded)`,
        );
      } else {
        this.logger.error(
          `Webhook failed: event=${payload.event} url=${url} error=${error.message}`,
        );
      }
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Notify all registered webhooks for a company about an invoice status change.
   */
  async notifyInvoiceStatus(
    companyId: string,
    invoiceData: Record<string, any>,
    event: WebhookEvent,
  ): Promise<void> {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: {
        id: invoiceData.id as string,
        tipoDoc: invoiceData.tipoDoc as string,
        serie: invoiceData.serie as string,
        correlativo: invoiceData.correlativo as number,
        status: invoiceData.status as string,
        sunatCode: invoiceData.sunatCode as string | undefined,
        sunatMessage: invoiceData.sunatMessage as string | undefined,
      },
    };

    // Query active webhooks that subscribe to this event
    const webhooks = await this.prisma.client.webhook.findMany({
      where: { companyId, isActive: true, events: { has: event } },
    });

    if (webhooks.length === 0) {
      this.logger.debug(
        `No webhooks registered for company=${companyId} event=${event}`,
      );
      return;
    }

    this.logger.log(
      `Dispatching ${webhooks.length} webhook(s): company=${companyId} event=${event} ` +
        `invoice=${payload.data.serie}-${payload.data.correlativo}`,
    );

    await Promise.allSettled(
      webhooks.map((wh) => this.sendWebhook(wh.url, payload, wh.secret)),
    );
  }
}
