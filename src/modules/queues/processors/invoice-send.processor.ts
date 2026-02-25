// ═══════════════════════════════════════════════════════════════════
// Invoice Send Processor — Sends signed invoices to SUNAT via SOAP
// ═══════════════════════════════════════════════════════════════════

import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { InvoiceStatus } from '../../../generated/prisma/enums.js';
import { SunatClientService } from '../../sunat-client/sunat-client.service.js';
import { CdrProcessorService } from '../../cdr-processor/cdr-processor.service.js';
import { CompaniesService } from '../../companies/companies.service.js';
import { WebhooksService } from '../../webhooks/webhooks.service.js';
import { createZipFromXml } from '../../../common/utils/zip.js';
import {
  QUEUE_INVOICE_SEND,
  QUEUE_PDF_GENERATE,
  QUEUE_EMAIL_SEND,
} from '../queues.constants.js';
import type { InvoiceSendJobData } from '../interfaces/index.js';
import type { WebhookEvent } from '../../webhooks/dto/webhook.dto.js';

/**
 * BullMQ processor for sending invoices to SUNAT.
 *
 * Orchestrates the full send pipeline for a single invoice:
 * 1. Load invoice from database
 * 2. If XML is not yet signed, build XML, sign it, and create ZIP
 * 3. Resolve SUNAT credentials (beta or production)
 * 4. Send ZIP via SOAP sendBill
 * 5. Process CDR response
 * 6. Update invoice status in database
 *
 * Retries are handled by BullMQ (5 attempts, exponential backoff from 2s).
 * On failure, the processor throws and BullMQ schedules the next attempt.
 *
 * Rate limited at 10 jobs/second to avoid overwhelming SUNAT web services.
 */
@Processor(QUEUE_INVOICE_SEND, {
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
})
export class InvoiceSendProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sunatClient: SunatClientService,
    private readonly cdrProcessor: CdrProcessorService,
    private readonly companies: CompaniesService,
    private readonly webhooks: WebhooksService,
    @InjectQueue(QUEUE_PDF_GENERATE) private readonly pdfQueue: Queue,
    @InjectQueue(QUEUE_EMAIL_SEND) private readonly emailQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<InvoiceSendJobData>): Promise<void> {
    const { invoiceId, companyId } = job.data;

    this.logger.log(
      `Processing invoice-send job ${job.id}: invoiceId=${invoiceId}, companyId=${companyId}, attempt=${job.attemptsMade + 1}`,
    );

    // 1. Load invoice with items
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { items: true },
    });

    if (!invoice) {
      this.logger.error(
        `Invoice ${invoiceId} not found for company ${companyId} — skipping`,
      );
      return; // Don't retry if the record doesn't exist
    }

    // Skip if already in a terminal state
    if (invoice.status === 'ACCEPTED' || invoice.status === 'OBSERVED') {
      this.logger.warn(
        `Invoice ${invoiceId} (${invoice.serie}-${invoice.correlativo}, tipoDoc=${invoice.tipoDoc}) already ${invoice.status} — skipping send. ` +
        `SUNAT code=${invoice.sunatCode ?? 'N/A'}, sentAt=${invoice.sentAt?.toISOString() ?? 'N/A'}`,
      );
      return;
    }

    // Skip if rejected and reached max attempts
    if (invoice.status === 'REJECTED') {
      this.logger.warn(
        `Invoice ${invoiceId} (${invoice.serie}-${invoice.correlativo}) already REJECTED — ` +
        `SUNAT code=${invoice.sunatCode ?? 'N/A'}, message=${invoice.sunatMessage ?? 'N/A'}. Not retrying.`,
      );
      return;
    }

    // 2. Update status to SENDING
    await this.prisma.client.invoice.update({
      where: { id: invoiceId },
      data: { status: 'SENDING', lastAttemptAt: new Date() },
    });

    // 3. Load company
    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    // 4. Verify we have signed XML ready to send
    if (!invoice.xmlContent || !invoice.xmlSigned) {
      this.logger.error(
        `Invoice ${invoiceId} has no signed XML — cannot send. The invoice must be regenerated.`,
      );
      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'REJECTED',
          sunatCode: 'INTERNAL_ERROR',
          sunatMessage: 'Invoice has no signed XML content. Must be regenerated.',
          lastError: 'Missing signed XML in processor',
        },
      });
      return; // Don't retry — needs manual intervention
    }

    const signedXml = invoice.xmlContent;

    // 5. Create ZIP for SUNAT
    const correlativoPadded = String(invoice.correlativo).padStart(8, '0');
    const xmlFileName = `${company.ruc}-${invoice.tipoDoc}-${invoice.serie}-${correlativoPadded}.xml`;
    const zipFileName = xmlFileName.replace('.xml', '.zip');
    const zipBuffer = await createZipFromXml(signedXml, xmlFileName);

    // 6. Resolve SUNAT credentials
    const ruc = company.isBeta ? '20000000001' : company.ruc;
    let solUser: string;
    let solPass: string;

    if (company.isBeta) {
      solUser = 'MODDATOS';
      solPass = 'moddatos';
    } else {
      const solCreds = await this.companies.getSolCredentials(companyId);
      if (!solCreds) {
        throw new Error(
          `No SOL credentials found for company ${companyId}. Configure them before sending.`,
        );
      }
      solUser = solCreds.solUser;
      solPass = solCreds.solPass;
    }

    // 7. Send to SUNAT
    // Retention (20) and Perception (40) documents use a different SUNAT endpoint
    const endpointType = ['20', '40'].includes(invoice.tipoDoc) ? 'retention' as const : 'invoice' as const;

    this.logger.log(
      `Sending ${zipFileName} to SUNAT (${company.isBeta ? 'beta' : 'prod'}, endpoint=${endpointType})`,
    );

    const result = await this.sunatClient.sendBill(
      zipBuffer,
      zipFileName,
      ruc,
      solUser,
      solPass,
      company.isBeta,
      endpointType,
    );

    // 8. Process result
    if (result.success && result.cdrZip) {
      const cdr = this.cdrProcessor.processCdr(result.cdrZip);

      let status: InvoiceStatus;
      if (cdr.isAccepted) {
        status = cdr.hasObservations ? 'OBSERVED' : 'ACCEPTED';
      } else {
        status = 'REJECTED';
      }

      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: {
          status,
          sunatCode: cdr.responseCode,
          sunatMessage: cdr.description,
          sunatNotes: cdr.notes.length > 0 ? cdr.notes : undefined,
          cdrZip: result.cdrZip ? new Uint8Array(result.cdrZip) : undefined,
          sentAt: new Date(),
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(
        `Invoice ${invoice.serie}-${invoice.correlativo} sent to SUNAT: status=${status}, code=${cdr.responseCode}`,
      );

      // === Post-send pipeline ===
      await this.triggerPostSendPipeline(invoice, companyId, status);
    } else {
      // SUNAT returned an error without CDR — may be retriable
      const errorMessage = result.rawFaultString ?? result.message ?? 'Unknown SUNAT error';
      const maxAttempts = job.opts.attempts ?? 5;
      const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;

      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: {
          // Only set REJECTED on the final attempt; keep SENDING while retries remain
          status: isLastAttempt ? 'REJECTED' : 'SENDING',
          sunatCode: result.rawFaultCode ?? result.code,
          sunatMessage: errorMessage,
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          lastError: errorMessage,
        },
      });

      // Throw so BullMQ can retry if SOAP faults are transient
      throw new Error(
        `SUNAT sendBill failed for ${zipFileName}: ${errorMessage}`,
      );
    }
  }

  /**
   * After SUNAT responds, trigger webhook, email, and PDF generation.
   */
  private async triggerPostSendPipeline(
    invoice: { id: string; tipoDoc: string; serie: string; correlativo: number; clienteEmail: string | null; xmlContent: string | null; sunatCode?: string | null; sunatMessage?: string | null },
    companyId: string,
    status: string,
  ): Promise<void> {
    // 1. Webhook notification
    const eventMap: Record<string, WebhookEvent> = {
      ACCEPTED: 'invoice.accepted',
      OBSERVED: 'invoice.observed',
      REJECTED: 'invoice.rejected',
    };
    const event = eventMap[status];
    if (event) {
      try {
        await this.webhooks.notifyInvoiceStatus(companyId, { ...invoice, status }, event);
      } catch (err: any) {
        this.logger.warn(`Webhook dispatch failed: ${err.message}`);
      }
    }

    // 2. Queue PDF generation
    try {
      await this.pdfQueue.add(
        'post-send-pdf',
        { invoiceId: invoice.id, companyId, format: 'a4' },
        { jobId: `pdf-${invoice.id}-${Date.now()}` },
      );
    } catch (err: any) {
      this.logger.warn(`Failed to queue PDF generation: ${err.message}`);
    }

    // 3. Queue email notification if client has an email
    if (invoice.clienteEmail && (status === 'ACCEPTED' || status === 'OBSERVED')) {
      try {
        const correlativoPadded = String(invoice.correlativo).padStart(8, '0');
        const docNumber = `${invoice.serie}-${correlativoPadded}`;
        await this.emailQueue.add(
          'invoice-notification',
          {
            to: invoice.clienteEmail,
            subject: `Comprobante electrónico ${docNumber}`,
            body: `<p>Estimado cliente,</p><p>Su comprobante electrónico ${docNumber} ha sido aceptado por SUNAT.</p><p>Adjuntamos el XML del documento.</p>`,
            attachments: invoice.xmlContent
              ? [
                  {
                    filename: `${docNumber}.xml`,
                    content: Buffer.from(invoice.xmlContent).toString('base64'),
                    contentType: 'application/xml',
                  },
                ]
              : undefined,
          },
          { jobId: `email-${invoice.id}-${Date.now()}` },
        );
      } catch (err: any) {
        this.logger.warn(`Failed to queue email notification: ${err.message}`);
      }
    }
  }
}
