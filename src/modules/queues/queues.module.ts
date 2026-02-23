// ═══════════════════════════════════════════════════════════════════
// Queues Module — BullMQ queue registration and processor providers
// ═══════════════════════════════════════════════════════════════════

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

// Queue name constants
import {
  QUEUE_INVOICE_SEND,
  QUEUE_PDF_GENERATE,
  QUEUE_EMAIL_SEND,
  QUEUE_SUMMARY_SEND,
} from './queues.constants.js';

// Processors
import { InvoiceSendProcessor } from './processors/invoice-send.processor.js';
import { PdfGenerateProcessor } from './processors/pdf-generate.processor.js';
import { EmailSendProcessor } from './processors/email-send.processor.js';
import { SummarySendProcessor } from './processors/summary-send.processor.js';

// Feature modules whose services are injected into processors
import { XmlBuilderModule } from '../xml-builder/xml-builder.module.js';
import { XmlSignerModule } from '../xml-signer/xml-signer.module.js';
import { SunatClientModule } from '../sunat-client/sunat-client.module.js';
import { CdrProcessorModule } from '../cdr-processor/cdr-processor.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { PdfGeneratorModule } from '../pdf-generator/pdf-generator.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';

/**
 * QueuesModule — Registers BullMQ queues and their processor workers.
 *
 * Queue configuration:
 * - `invoice-send`  : 5 retries, exponential backoff (2s), concurrency 5, rate 10/s
 * - `pdf-generate`  : 3 retries, concurrency 5
 * - `email-send`    : 3 retries, concurrency 5
 * - `summary-send`  : 5 retries, exponential backoff (2s), concurrency 5, rate 10/s
 *
 * The BullModule.forRootAsync() Redis connection is configured in AppModule.
 * This module only registers the individual queues and provides the processor classes.
 *
 * Note: PrismaModule is @Global() and does not need to be imported here.
 *
 * Dependencies:
 * - PrismaModule (global) — database access for all processors
 * - XmlBuilderModule — XML generation for invoice-send
 * - XmlSignerModule — XML signing for invoice-send
 * - SunatClientModule — SOAP client for invoice-send and summary-send
 * - CdrProcessorModule — CDR parsing for invoice-send
 * - CertificatesModule — PFX certificate decryption for invoice-send
 * - CompaniesModule — SOL credentials for invoice-send
 */
@Module({
  imports: [
    // Register all 4 BullMQ queues with their default job options
    BullModule.registerQueue(
      {
        name: QUEUE_INVOICE_SEND,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      },
      {
        name: QUEUE_PDF_GENERATE,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      },
      {
        name: QUEUE_EMAIL_SEND,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      },
      {
        name: QUEUE_SUMMARY_SEND,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      },
    ),

    // Feature modules providing services consumed by processors
    XmlBuilderModule,
    XmlSignerModule,
    SunatClientModule,
    CdrProcessorModule,
    CertificatesModule,
    CompaniesModule,
    PdfGeneratorModule,
    NotificationsModule,
    WebhooksModule,
  ],
  providers: [
    InvoiceSendProcessor,
    PdfGenerateProcessor,
    EmailSendProcessor,
    SummarySendProcessor,
  ],
  // Export BullModule so other modules can inject Queue instances to add jobs
  exports: [BullModule],
})
export class QueuesModule {}
