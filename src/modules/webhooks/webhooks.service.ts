import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { WebhookEvent, WebhookPayload } from './dto/webhook.dto.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  /**
   * Send a webhook notification to a URL.
   *
   * - POSTs the payload as JSON
   * - Adds standard headers: Content-Type, X-Webhook-Event, X-Webhook-Timestamp
   * - If a secret is provided, signs the payload body with HMAC-SHA256
   *   and adds `X-Webhook-Signature: sha256={hex}`
   * - Enforces a 10-second timeout via AbortController
   *
   * @returns true on 2xx response, false otherwise
   */
  async sendWebhook(
    url: string,
    payload: WebhookPayload,
    secret?: string,
  ): Promise<boolean> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': payload.timestamp,
    };

    // Sign payload with HMAC-SHA256 if a shared secret is provided
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
   *
   * Currently a placeholder that logs the event. In a future iteration this will
   * read webhook endpoint URLs from the database for the given company and
   * dispatch sendWebhook calls for each one.
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

    this.logger.log(
      `Webhook event queued: company=${companyId} event=${event} ` +
        `invoice=${payload.data.serie}-${payload.data.correlativo}`,
    );

    // TODO: Read webhook URLs from database for this company and dispatch
    // const webhooks = await this.prisma.webhook.findMany({
    //   where: { companyId, isActive: true, events: { has: event } },
    // });
    // await Promise.allSettled(
    //   webhooks.map((wh) => this.sendWebhook(wh.url, payload, wh.secret)),
    // );
  }
}
