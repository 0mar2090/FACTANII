// ═══════════════════════════════════════════════════════════════════
// Summary Send Processor — Sends daily summaries and voided docs to SUNAT
// ═══════════════════════════════════════════════════════════════════

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SunatClientService } from '../../sunat-client/sunat-client.service.js';
import { createZipFromXml } from '../../../common/utils/zip.js';
import { QUEUE_SUMMARY_SEND } from '../queues.constants.js';
import type { SummarySendJobData } from '../interfaces/index.js';

/**
 * Result returned when a summary-send job completes successfully.
 */
export interface SummarySendResult {
  /** SUNAT ticket number for polling getStatus */
  ticket: string;
  /** Human-readable message */
  message: string;
}

/**
 * BullMQ processor for sending Resumen Diario (RC) and
 * Comunicacion de Baja (RA) documents to SUNAT.
 *
 * These are asynchronous SUNAT operations:
 * 1. Receives pre-built signed XML
 * 2. Creates ZIP
 * 3. Sends via SOAP sendSummary
 * 4. Returns the SUNAT ticket number for later polling
 *
 * Retries are handled by BullMQ (5 attempts, exponential backoff from 2s).
 * Rate limited at 10 jobs/second to avoid overwhelming SUNAT web services.
 *
 * The caller is responsible for subsequently polling getStatus using the
 * ticket returned in the job result.
 */
@Processor(QUEUE_SUMMARY_SEND, {
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
})
export class SummarySendProcessor extends WorkerHost {
  private readonly logger = new Logger(SummarySendProcessor.name);

  constructor(
    private readonly sunatClient: SunatClientService,
  ) {
    super();
  }

  async process(job: Job<SummarySendJobData>): Promise<SummarySendResult> {
    const {
      summaryXml,
      zipFileName,
      xmlFileName,
      ruc,
      solUser,
      solPass,
      isBeta,
    } = job.data;

    this.logger.log(
      `Processing summary-send job ${job.id}: file=${zipFileName}, ruc=${ruc}, env=${isBeta ? 'beta' : 'prod'}, attempt=${job.attemptsMade + 1}`,
    );

    // 1. Create ZIP from signed XML
    const zipBuffer = await createZipFromXml(summaryXml, xmlFileName);

    // 2. Send to SUNAT via async sendSummary
    const result = await this.sunatClient.sendSummary(
      zipBuffer,
      zipFileName,
      ruc,
      solUser,
      solPass,
      isBeta,
    );

    // 3. Validate result
    if (result.success && result.ticket) {
      this.logger.log(
        `Summary sent to SUNAT: ${zipFileName} — ticket=${result.ticket}`,
      );

      return {
        ticket: result.ticket,
        message: `Summary accepted by SUNAT. Ticket: ${result.ticket}`,
      };
    }

    // SUNAT rejected or did not return a ticket — throw for retry
    const errorMessage = result.rawFaultString ?? result.message ?? 'Unknown SUNAT error';

    this.logger.error(
      `Summary send failed for ${zipFileName}: ${errorMessage}`,
    );

    throw new Error(
      `SUNAT sendSummary failed for ${zipFileName}: ${errorMessage}`,
    );
  }
}
