// ═══════════════════════════════════════════════════════════════════
// PDF Generator Module — Invoice PDF generation (A4 + 80mm ticket)
// ═══════════════════════════════════════════════════════════════════

import { Module } from '@nestjs/common';
import { PdfGeneratorService } from './pdf-generator.service.js';

/**
 * Module providing PDF generation capabilities for SUNAT electronic invoices.
 *
 * Supports two output formats:
 * - **A4**: Standard paper format with professional layout, suitable for
 *   printing and emailing. Includes company header, document type box,
 *   client info, items table, totals, monto en letras, and SUNAT response.
 * - **Ticket (80mm)**: Compact format for thermal printers, with centered
 *   headers, smaller fonts, and auto-height pages.
 *
 * Both formats use pdfmake with Roboto fonts for consistent rendering.
 * The generated PDFs are returned as Buffers for flexible downstream
 * handling (store in DB, serve via HTTP, attach to emails, etc.).
 *
 * Usage:
 * ```typescript
 * // In another module
 * @Module({
 *   imports: [PdfGeneratorModule],
 * })
 * export class InvoicesModule {}
 *
 * // In a service
 * @Injectable()
 * export class InvoicesService {
 *   constructor(private readonly pdfGenerator: PdfGeneratorService) {}
 *
 *   async getInvoicePdf(invoiceId: string): Promise<Buffer> {
 *     const data = await this.buildPdfData(invoiceId);
 *     return this.pdfGenerator.generateA4(data);
 *   }
 * }
 * ```
 */
@Module({
  providers: [PdfGeneratorService],
  exports: [PdfGeneratorService],
})
export class PdfGeneratorModule {}
