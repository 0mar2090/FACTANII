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
 * All queue names as an array, useful for bulk operations.
 */
export const ALL_QUEUES = [
  QUEUE_INVOICE_SEND,
  QUEUE_PDF_GENERATE,
  QUEUE_EMAIL_SEND,
  QUEUE_SUMMARY_SEND,
  QUEUE_TICKET_POLL,
] as const;

export type QueueName = (typeof ALL_QUEUES)[number];
