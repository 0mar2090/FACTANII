// ═══════════════════════════════════════════════════════════════════
// Job data interfaces for BullMQ queues
// ═══════════════════════════════════════════════════════════════════

/**
 * Job data for the `invoice-send` queue.
 *
 * The processor loads the invoice from DB, and if not yet signed,
 * builds the XML, signs it, creates a ZIP, and sends to SUNAT.
 */
export interface InvoiceSendJobData {
  /** Invoice record ID (cuid) */
  invoiceId: string;
  /** Company/tenant ID (cuid) */
  companyId: string;
}

/**
 * Job data for the `pdf-generate` queue.
 *
 * The processor loads the invoice with its items and generates a
 * PDF representation in the requested format.
 */
export interface PdfGenerateJobData {
  /** Invoice record ID (cuid) */
  invoiceId: string;
  /** Company/tenant ID (cuid) */
  companyId: string;
  /** PDF format: A4 full-page or 80mm thermal printer ticket */
  format?: 'a4' | 'ticket';
}

/**
 * Job data for the `email-send` queue.
 *
 * The processor sends a transactional email with optional file attachments
 * (e.g., invoice PDF, XML).
 */
export interface EmailSendJobData {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Email body (HTML) */
  body: string;
  /** Optional file attachments */
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  /** File name shown to recipient (e.g., "F001-123.pdf") */
  filename: string;
  /** Base64-encoded file content */
  content: string;
  /** MIME type (e.g., "application/pdf", "application/xml") */
  contentType: string;
}

/**
 * Job data for the `summary-send` queue.
 *
 * The processor sends a pre-built summary/voided ZIP to SUNAT
 * via the asynchronous sendSummary SOAP operation and retrieves the ticket.
 */
export interface SummarySendJobData {
  /** The signed XML content (to be zipped before sending) */
  summaryXml: string;
  /** ZIP file name for SUNAT (e.g., "20000000001-RC-20260222-00001.zip") */
  zipFileName: string;
  /** XML file name inside the ZIP */
  xmlFileName: string;
  /** Company RUC (11 digits) */
  ruc: string;
  /** SOL username (decrypted) */
  solUser: string;
  /** SOL password (decrypted) */
  solPass: string;
  /** Whether to use the beta environment */
  isBeta: boolean;
}

/**
 * Job data for the `ticket-poll` queue.
 *
 * The processor polls SUNAT until the async operation completes with a CDR.
 * Supports both SOAP (RC/RA via getStatus) and GRE REST API (via getGuideStatus).
 */
export interface TicketPollJobData {
  /** SUNAT ticket number */
  ticket: string;
  /** Invoice record ID */
  invoiceId: string;
  /** Company/tenant ID */
  companyId: string;
  /** Company RUC */
  ruc: string;
  /** SOL username (decrypted) */
  solUser: string;
  /** SOL password (decrypted) */
  solPass: string;
  /** Whether to use the beta environment */
  isBeta: boolean;
  /** Document type: 'summary' (RC, default), 'voided' (RA), or 'guide' (GRE REST API) */
  documentType?: 'summary' | 'voided' | 'guide';
}
