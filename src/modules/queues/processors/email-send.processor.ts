// ═══════════════════════════════════════════════════════════════════
// Email Send Processor — Sends transactional emails with attachments
// ═══════════════════════════════════════════════════════════════════

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QUEUE_EMAIL_SEND } from '../queues.constants.js';
import type { EmailSendJobData } from '../interfaces/index.js';

/**
 * BullMQ processor for sending transactional emails.
 *
 * Handles emails such as:
 * - Invoice delivery to customers (PDF + XML attached)
 * - Welcome emails for new users
 * - Alert notifications (certificate expiry, billing, etc.)
 *
 * Retries are handled by BullMQ (3 attempts).
 *
 * NOTE: NotificationsService (Resend) is being built in parallel.
 * Once available, uncomment the import and inject it via constructor.
 */
@Processor(QUEUE_EMAIL_SEND, {
  concurrency: 5,
})
export class EmailSendProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(
    // TODO: Inject NotificationsService once the notifications module is ready
    // private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<EmailSendJobData>): Promise<void> {
    const { to, subject, attachments } = job.data;

    this.logger.log(
      `Processing email-send job ${job.id}: to=${to}, subject="${subject}", attachments=${attachments?.length ?? 0}, attempt=${job.attemptsMade + 1}`,
    );

    // TODO: Replace with actual NotificationsService call once available:
    //
    // await this.notifications.sendEmail({
    //   to: job.data.to,
    //   subject: job.data.subject,
    //   html: job.data.body,
    //   attachments: job.data.attachments?.map((a) => ({
    //     filename: a.filename,
    //     content: Buffer.from(a.content, 'base64'),
    //     contentType: a.contentType,
    //   })),
    // });
    //
    // this.logger.log(`Email sent to ${to}: "${subject}"`);

    // Placeholder: log and succeed
    this.logger.warn(
      `NotificationsService not yet available — skipping email send to ${to}`,
    );
  }
}
