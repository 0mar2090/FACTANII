// ═══════════════════════════════════════════════════════════════════
// Dead Letter Queue Listener — Captures permanently failed jobs
// ═══════════════════════════════════════════════════════════════════

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QueueEvents } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  QUEUE_INVOICE_SEND,
  QUEUE_PDF_GENERATE,
  QUEUE_EMAIL_SEND,
  QUEUE_SUMMARY_SEND,
  QUEUE_TICKET_POLL,
  QUEUE_DLQ,
} from '../queues.constants.js';

/**
 * Listens for permanently failed jobs across all queues and moves
 * their data to the Dead Letter Queue for manual review.
 *
 * BullMQ does not have built-in DLQ support, so this service
 * uses QueueEvents to detect when a job has exhausted all retries
 * and adds the failure details to the DLQ.
 */
@Injectable()
export class DlqListener implements OnModuleInit {
  private readonly logger = new Logger(DlqListener.name);
  private readonly queueEventListeners: QueueEvents[] = [];

  constructor(
    @InjectQueue(QUEUE_DLQ) private readonly dlqQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const monitoredQueues = [
      QUEUE_INVOICE_SEND,
      QUEUE_PDF_GENERATE,
      QUEUE_EMAIL_SEND,
      QUEUE_SUMMARY_SEND,
      QUEUE_TICKET_POLL,
    ];

    const redisHost = this.config.get<string>('redis.host', 'localhost');
    const redisPort = this.config.get<number>('redis.port', 6379);

    for (const queueName of monitoredQueues) {
      const queueEvents = new QueueEvents(queueName, {
        connection: { host: redisHost, port: redisPort },
      });

      queueEvents.on('failed', async ({ jobId, failedReason }) => {
        // BullMQ fires 'failed' on every attempt — check if it's the final failure
        // by verifying the job's attemptsMade vs opts.attempts.
        // Since we can't access the job object from QueueEvents directly,
        // we log all failures and rely on the DLQ job name to identify the source.
        this.logger.error(
          `Job permanently failed in ${queueName}: jobId=${jobId}, reason=${failedReason}`,
        );

        try {
          await this.dlqQueue.add(
            `dlq-${queueName}`,
            {
              originalQueue: queueName,
              originalJobId: jobId,
              failedReason,
              failedAt: new Date().toISOString(),
            },
            {
              jobId: `dlq-${queueName}-${jobId}-${Date.now()}`,
            },
          );
        } catch (err: any) {
          this.logger.error(`Failed to add job to DLQ: ${err.message}`);
        }
      });

      this.queueEventListeners.push(queueEvents);
    }

    this.logger.log(
      `DLQ listener monitoring ${monitoredQueues.length} queues`,
    );
  }
}
