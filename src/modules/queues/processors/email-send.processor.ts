import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { QUEUE_EMAIL_SEND } from '../queues.constants.js';
import type { EmailSendJobData } from '../interfaces/index.js';

@Processor(QUEUE_EMAIL_SEND, {
  concurrency: 5,
})
export class EmailSendProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<EmailSendJobData>): Promise<void> {
    const { to, subject, body, attachments } = job.data;

    this.logger.log(
      `Processing email-send job ${job.id}: to=${to}, subject="${subject}", attachments=${attachments?.length ?? 0}, attempt=${job.attemptsMade + 1}`,
    );

    const result = await this.notifications.sendEmail({
      to,
      subject,
      html: body,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
      })),
    });

    if (!result.success) {
      throw new Error(
        `Failed to send email to ${to}: "${subject}"`,
      );
    }

    this.logger.log(`Email sent to ${to}: "${subject}" [id=${result.id}]`);
  }
}
