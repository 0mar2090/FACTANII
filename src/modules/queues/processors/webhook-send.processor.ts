// =====================================================================
// Webhook Send Processor — Delivers webhook notifications to endpoints
// =====================================================================

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_WEBHOOK_SEND } from '../queues.constants.js';
import type { WebhookSendJobData } from '../interfaces/index.js';

/**
 * BullMQ processor for delivering webhook notifications.
 *
 * For each job:
 * 1. Load the webhook record from the database
 * 2. Skip if the webhook is no longer active
 * 3. POST the JSON payload to the webhook URL
 * 4. Sign the request body with HMAC-SHA256 if a secret is configured
 * 5. Timeout after 10 seconds
 *
 * Retries: 3 attempts with exponential backoff (5s base).
 * Concurrency: 3 workers.
 */
@Processor(QUEUE_WEBHOOK_SEND, {
  concurrency: 3,
})
export class WebhookSendProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<WebhookSendJobData>): Promise<void> {
    const { webhookId, invoiceId, companyId, event, payload } = job.data;

    this.logger.log(
      `Processing webhook-send job ${job.id}: webhook=${webhookId} event=${event} invoice=${invoiceId} attempt=${job.attemptsMade + 1}`,
    );

    // 1. Load webhook from DB
    const webhook = await this.prisma.client.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      this.logger.warn(
        `Webhook ${webhookId} not found, skipping delivery for event=${event} invoice=${invoiceId}`,
      );
      return;
    }

    // 2. Skip if webhook has been deactivated since the job was queued
    if (!webhook.isActive) {
      this.logger.log(
        `Webhook ${webhookId} is inactive, skipping delivery for event=${event} invoice=${invoiceId}`,
      );
      return;
    }

    // 3. Build request
    const body = JSON.stringify(payload);
    const timestamp = new Date().toISOString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'FacturaPE-Webhook/1.0',
      'X-Webhook-Event': event,
      'X-Webhook-Timestamp': timestamp,
    };

    // 4. Sign the body with HMAC-SHA256 if a secret is configured
    if (webhook.secret) {
      const signature = createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    // 5. Send with 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (response.ok) {
        this.logger.log(
          `Webhook delivered: webhook=${webhookId} event=${event} url=${webhook.url} status=${response.status} invoice=${invoiceId}`,
        );
        return;
      }

      // Non-2xx response — throw to trigger BullMQ retry
      const responseBody = await response.text().catch(() => '(unreadable)');
      throw new Error(
        `Webhook endpoint returned HTTP ${response.status}: ${responseBody.slice(0, 200)}`,
      );
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(
          `Webhook delivery timed out after 10s: webhook=${webhookId} url=${webhook.url}`,
        );
      }

      // Re-throw so BullMQ retries the job
      this.logger.error(
        `Webhook delivery failed: webhook=${webhookId} event=${event} url=${webhook.url} error=${error.message}`,
      );
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
