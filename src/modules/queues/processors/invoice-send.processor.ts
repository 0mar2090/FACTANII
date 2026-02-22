// ═══════════════════════════════════════════════════════════════════
// Invoice Send Processor — Sends signed invoices to SUNAT via SOAP
// ═══════════════════════════════════════════════════════════════════

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { XmlBuilderService } from '../../xml-builder/xml-builder.service.js';
import { XmlSignerService } from '../../xml-signer/xml-signer.service.js';
import { SunatClientService } from '../../sunat-client/sunat-client.service.js';
import { CdrProcessorService } from '../../cdr-processor/cdr-processor.service.js';
import { CertificatesService } from '../../certificates/certificates.service.js';
import { CompaniesService } from '../../companies/companies.service.js';
import { createZipFromXml } from '../../../common/utils/zip.js';
import { QUEUE_INVOICE_SEND } from '../queues.constants.js';
import type { InvoiceSendJobData } from '../interfaces/index.js';

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
    private readonly xmlBuilder: XmlBuilderService,
    private readonly xmlSigner: XmlSignerService,
    private readonly sunatClient: SunatClientService,
    private readonly cdrProcessor: CdrProcessorService,
    private readonly certificates: CertificatesService,
    private readonly companies: CompaniesService,
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
      this.logger.log(
        `Invoice ${invoiceId} already ${invoice.status} — skipping`,
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

    // 4. Ensure we have signed XML; if not, build and sign
    let signedXml = invoice.xmlContent;
    let xmlHash = invoice.xmlHash;

    if (!signedXml || !invoice.xmlSigned) {
      this.logger.log(
        `Invoice ${invoiceId} has no signed XML — building and signing`,
      );

      const cert = await this.certificates.getActiveCertificate(companyId);

      // Build XML based on document type
      // The invoice should already have been validated before being queued.
      // Here we rebuild the XML from stored data if it was somehow lost.
      const unsignedXml = invoice.xmlContent;
      if (!unsignedXml) {
        throw new Error(
          `Invoice ${invoiceId} has no XML content — cannot sign. The invoice must be regenerated.`,
        );
      }

      signedXml = this.xmlSigner.sign(unsignedXml, cert.pfxBuffer, cert.passphrase);
      xmlHash = this.xmlSigner.getXmlHash(signedXml);

      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: {
          xmlContent: signedXml,
          xmlHash,
          xmlSigned: true,
        },
      });
    }

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
    this.logger.log(
      `Sending ${zipFileName} to SUNAT (${company.isBeta ? 'beta' : 'prod'})`,
    );

    const result = await this.sunatClient.sendBill(
      zipBuffer,
      zipFileName,
      ruc,
      solUser,
      solPass,
      company.isBeta,
    );

    // 8. Process result
    if (result.success && result.cdrZip) {
      const cdr = this.cdrProcessor.processCdr(result.cdrZip);

      let status: string;
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
          cdrZip: result.cdrZip,
          sentAt: new Date(),
          attempts: invoice.attempts + 1,
          lastAttemptAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(
        `Invoice ${invoice.serie}-${invoice.correlativo} sent to SUNAT: status=${status}, code=${cdr.responseCode}`,
      );
    } else {
      // SUNAT returned an error without CDR — may be retriable
      const errorMessage = result.rawFaultString ?? result.message ?? 'Unknown SUNAT error';

      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'REJECTED',
          sunatCode: result.rawFaultCode ?? result.code,
          sunatMessage: errorMessage,
          attempts: invoice.attempts + 1,
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
}
