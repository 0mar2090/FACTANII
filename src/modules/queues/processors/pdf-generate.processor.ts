// ═══════════════════════════════════════════════════════════════════
// PDF Generate Processor — Generates PDF representations of invoices
// ═══════════════════════════════════════════════════════════════════

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_PDF_GENERATE } from '../queues.constants.js';
import type { PdfGenerateJobData } from '../interfaces/index.js';

/**
 * BullMQ processor for generating PDF representations of invoices.
 *
 * Pipeline:
 * 1. Load invoice with items from database
 * 2. Load company data for header/footer
 * 3. Generate PDF via PdfGeneratorService (A4 or ticket format)
 * 4. Store PDF and update pdfUrl on the invoice record
 *
 * Retries are handled by BullMQ (3 attempts).
 *
 * NOTE: PdfGeneratorService is being built in parallel.
 * Once available, uncomment the import and inject it via constructor.
 */
@Processor(QUEUE_PDF_GENERATE, {
  concurrency: 5,
})
export class PdfGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfGenerateProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    // TODO: Inject PdfGeneratorService once the pdf-generator module is ready
    // private readonly pdfGenerator: PdfGeneratorService,
  ) {
    super();
  }

  async process(job: Job<PdfGenerateJobData>): Promise<void> {
    const { invoiceId, companyId, format = 'a4' } = job.data;

    this.logger.log(
      `Processing pdf-generate job ${job.id}: invoiceId=${invoiceId}, format=${format}, attempt=${job.attemptsMade + 1}`,
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
      return;
    }

    // 2. Load company data
    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    // 3. Generate PDF
    // TODO: Replace with actual PdfGeneratorService call once available:
    //
    // let pdfBuffer: Buffer;
    // if (format === 'ticket') {
    //   pdfBuffer = await this.pdfGenerator.generateTicket(invoice, company);
    // } else {
    //   pdfBuffer = await this.pdfGenerator.generateA4(invoice, company);
    // }
    //
    // For now, log a placeholder message.
    this.logger.warn(
      `PdfGeneratorService not yet available — skipping PDF generation for invoice ${invoiceId}`,
    );

    // 4. Store PDF and update invoice
    // TODO: Once PDF is generated, store it (local file, S3, etc.) and update the record:
    //
    // const pdfPath = `pdfs/${company.ruc}/${invoice.serie}-${invoice.correlativo}.pdf`;
    // await storePdfBuffer(pdfBuffer, pdfPath); // Storage implementation TBD
    //
    // await this.prisma.client.invoice.update({
    //   where: { id: invoiceId },
    //   data: { pdfUrl: pdfPath },
    // });
    //
    // this.logger.log(
    //   `PDF generated for invoice ${invoice.serie}-${invoice.correlativo}: ${pdfPath}`,
    // );
  }
}
