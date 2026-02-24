import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SunatClientService } from '../../sunat-client/sunat-client.service.js';
import { SunatGreClientService } from '../../sunat-client/sunat-gre-client.service.js';
import { CdrProcessorService } from '../../cdr-processor/cdr-processor.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE_TICKET_POLL } from '../queues.constants.js';
import type { TicketPollJobData } from '../interfaces/index.js';

/** Maximum polling window: 24 hours. After this, the job is abandoned. */
const MAX_POLL_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * BullMQ processor for polling SUNAT async operations:
 *
 * 1. **SOAP (RC/RA):** Uses getStatus(ticket) for Resumen Diario / Comunicación de Baja.
 * 2. **GRE REST API:** Uses getGuideStatus(ticket) for Guías de Remisión.
 *
 * Configured with 20 attempts, fixed 30s polling interval (~10 min window).
 * Enforces a maximum polling window of 24 hours regardless of attempts remaining.
 */
@Processor(QUEUE_TICKET_POLL, {
  concurrency: 3,
})
export class TicketPollProcessor extends WorkerHost {
  private readonly logger = new Logger(TicketPollProcessor.name);

  constructor(
    private readonly sunatClient: SunatClientService,
    private readonly sunatGreClient: SunatGreClientService,
    private readonly cdrProcessor: CdrProcessorService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<TicketPollJobData>): Promise<void> {
    const { documentType, invoiceId, ticket } = job.data;

    // Validate required fields
    if (!ticket || !invoiceId) {
      this.logger.error(
        `Ticket poll job ${job.id} missing required fields: ticket=${ticket}, invoiceId=${invoiceId}`,
      );
      return; // Don't retry — data is invalid
    }

    // Enforce maximum polling window
    const elapsed = Date.now() - job.timestamp;
    if (elapsed > MAX_POLL_WINDOW_MS) {
      this.logger.error(
        `Ticket poll for invoice ${invoiceId} exceeded max window (${Math.round(elapsed / 60_000)}min). Marking as REJECTED.`,
      );
      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'REJECTED',
          sunatCode: 'TIMEOUT',
          sunatMessage: 'SUNAT did not respond within the maximum polling window (24h)',
        },
      });
      return; // Don't retry
    }

    if (documentType === 'guide') {
      return this.pollGreStatus(job);
    }

    return this.pollSoapStatus(job);
  }

  /**
   * Poll SOAP getStatus for RC/RA documents.
   */
  private async pollSoapStatus(job: Job<TicketPollJobData>): Promise<void> {
    const { ticket, invoiceId, ruc, solUser, solPass, isBeta } = job.data;

    this.logger.log(
      `Polling SOAP ticket ${ticket} for invoice ${invoiceId} (attempt ${job.attemptsMade + 1}/20)`,
    );

    const result = await this.sunatClient.getStatus(
      ticket, ruc, solUser, solPass, isBeta,
    );

    // Complete with CDR (statusCode '99' = processing done, CDR available)
    // IMPORTANT: Check CDR BEFORE still-processing, because getStatus returns
    // code:'0' (CDR response code) for completed tickets — which would falsely
    // match a "still processing" check on `result.code`.
    if (result.success && result.cdrZip) {
      const cdr = await this.cdrProcessor.processCdr(
        Buffer.isBuffer(result.cdrZip) ? result.cdrZip : Buffer.from(result.cdrZip),
      );

      const status = cdr.isAccepted
        ? (cdr.hasObservations ? 'OBSERVED' : 'ACCEPTED')
        : 'REJECTED';

      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: {
          status,
          sunatCode: cdr.responseCode,
          sunatMessage: cdr.description,
          sunatNotes: cdr.notes.length > 0 ? cdr.notes : undefined,
          cdrZip: new Uint8Array(Buffer.isBuffer(result.cdrZip) ? result.cdrZip : Buffer.from(result.cdrZip)),
          sentAt: new Date(),
        },
      });

      this.logger.log(
        `Ticket ${ticket} resolved: ${status} (code=${cdr.responseCode}) for invoice ${invoiceId}`,
      );
      return;
    }

    // Still processing — throw to trigger retry with backoff.
    // Uses `statusCode` (ticket status: '0'=received, '98'=processing)
    // NOT `code` (which is the CDR response code, a different field).
    if (result.statusCode === '98' || result.statusCode === '0') {
      this.logger.debug(`Ticket ${ticket} still processing (statusCode=${result.statusCode})`);
      throw new Error(`SUNAT ticket ${ticket} still processing (statusCode=${result.statusCode})`);
    }

    // SUNAT returned an error
    const errorMsg = result.message ?? 'Unknown SUNAT getStatus error';
    this.logger.error(`Ticket ${ticket} failed: ${errorMsg}`);

    await this.prisma.client.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'REJECTED',
        sunatCode: result.statusCode ?? 'ERROR',
        sunatMessage: errorMsg,
      },
    });
  }

  /**
   * Poll GRE REST API getGuideStatus for Guías de Remisión.
   */
  private async pollGreStatus(job: Job<TicketPollJobData>): Promise<void> {
    const { ticket, invoiceId, ruc, solUser, solPass, isBeta } = job.data;

    this.logger.log(
      `Polling GRE ticket ${ticket} for invoice ${invoiceId} (attempt ${job.attemptsMade + 1}/20)`,
    );

    const result = await this.sunatGreClient.getGuideStatus(
      ticket, ruc, solUser, solPass, isBeta,
    );

    // CDR not yet generated — throw to trigger retry
    if (result.success && !result.indCdrGenerado) {
      this.logger.debug(`GRE ticket ${ticket} — CDR not yet generated`);
      throw new Error(`GRE ticket ${ticket} CDR not yet generated`);
    }

    // Complete with CDR
    if (result.success && result.cdrZip) {
      const cdr = await this.cdrProcessor.processCdr(
        Buffer.isBuffer(result.cdrZip) ? result.cdrZip : Buffer.from(result.cdrZip),
      );

      const status = cdr.isAccepted
        ? (cdr.hasObservations ? 'OBSERVED' : 'ACCEPTED')
        : 'REJECTED';

      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: {
          status,
          sunatCode: cdr.responseCode,
          sunatMessage: cdr.description,
          sunatNotes: cdr.notes.length > 0 ? cdr.notes : undefined,
          cdrZip: new Uint8Array(result.cdrZip),
          sentAt: new Date(),
        },
      });

      this.logger.log(
        `GRE ticket ${ticket} resolved: ${status} (code=${cdr.responseCode}) for invoice ${invoiceId}`,
      );
      return;
    }

    // API error
    const errorMsg = result.message ?? 'Unknown GRE API error';
    this.logger.error(`GRE ticket ${ticket} failed: ${errorMsg}`);

    await this.prisma.client.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'REJECTED',
        sunatCode: result.codRespuesta ?? 'ERROR',
        sunatMessage: errorMsg,
      },
    });
  }
}
