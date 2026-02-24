// ═══════════════════════════════════════════════════════════════════
// Queue name constants for BullMQ processors
// ═══════════════════════════════════════════════════════════════════

/**
 * Queue name for sending invoices/boletas/notes to SUNAT via SOAP.
 *
 * - Synchronous sendBill operation
 * - 5 retry attempts with exponential backoff (2s base)
 * - Concurrency: 5
 * - Rate limited: 10 jobs/second
 */
export const QUEUE_INVOICE_SEND = 'invoice-send' as const;

/**
 * Queue name for generating PDF representations of invoices.
 *
 * - A4 and 80mm ticket formats
 * - 3 retry attempts
 * - Concurrency: 5
 */
export const QUEUE_PDF_GENERATE = 'pdf-generate' as const;

/**
 * Queue name for sending transactional emails with invoice attachments.
 *
 * - Uses Resend email service
 * - 3 retry attempts
 * - Concurrency: 5
 */
export const QUEUE_EMAIL_SEND = 'email-send' as const;

/**
 * Queue name for sending daily summaries and voided documents to SUNAT.
 *
 * - Asynchronous sendSummary operation (returns ticket)
 * - 5 retry attempts with exponential backoff (2s base)
 * - Concurrency: 5
 * - Rate limited: 10 jobs/second
 */
export const QUEUE_SUMMARY_SEND = 'summary-send' as const;

/**
 * Queue name for polling SUNAT getStatus for async operations
 * (Resumen Diario, Comunicacion de Baja).
 *
 * - Polls getStatus with ticket number
 * - 15 retry attempts with exponential backoff (10s base, max 5min)
 * - Concurrency: 3
 */
export const QUEUE_TICKET_POLL = 'ticket-poll' as const;

/**
 * Queue name for delivering webhook notifications to registered endpoints.
 *
 * - POST to webhook URL with HMAC-SHA256 signature
 * - 3 retry attempts with exponential backoff (5s base)
 * - Concurrency: 3
 */
export const QUEUE_WEBHOOK_SEND = 'webhook-send' as const;

/**
 * Queue name for permanently failed jobs (Dead Letter Queue).
 *
 * - Jobs are moved here after all retry attempts are exhausted
 * - No automatic processing — used for manual review and alerting
 * - removeOnComplete disabled to preserve all DLQ entries
 */
export const QUEUE_DLQ = 'dead-letter-queue' as const;

/**
 * All queue names as an array, useful for bulk operations.
 */
export const ALL_QUEUES = [
  QUEUE_INVOICE_SEND,
  QUEUE_PDF_GENERATE,
  QUEUE_EMAIL_SEND,
  QUEUE_SUMMARY_SEND,
  QUEUE_TICKET_POLL,
  QUEUE_WEBHOOK_SEND,
  QUEUE_DLQ,
] as const;

export type QueueName = (typeof ALL_QUEUES)[number];
