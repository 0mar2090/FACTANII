// ═══════════════════════════════════════════════════════════════════
// PDF Generator Service — Generates PDF invoices using pdfmake
// ═══════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import QRCode from 'qrcode';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces.js';

// pdfmake doesn't have proper ESM exports — use CJS require for the printer class
const require = createRequire(import.meta.url);
const PdfPrinter = require('pdfmake/js/printer.js').default;
import type { PdfInvoiceData } from './interfaces/pdf-data.interface.js';
import { buildA4Template } from './templates/invoice-a4.template.js';
import { buildTicketTemplate } from './templates/invoice-ticket.template.js';

/**
 * Service responsible for generating PDF representations of SUNAT
 * electronic invoices (CPE). Supports both A4 and 80mm ticket formats.
 *
 * Uses pdfmake for server-side PDF generation with the Roboto font family.
 * The generated PDFs include:
 * - Company and client information
 * - Line items with tax breakdown
 * - Totals (Op. Gravadas, IGV, etc.)
 * - Monto en letras (amount in Spanish words)
 * - XML hash digest for verification
 * - SUNAT response status
 *
 * Usage:
 * ```typescript
 * const pdfBuffer = await pdfGeneratorService.generateA4(invoiceData);
 * const ticketBuffer = await pdfGeneratorService.generateTicket(invoiceData);
 * ```
 */
@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private readonly printer: any;

  constructor() {
    // Resolve font paths relative to the project root (process.cwd()).
    // pdfmake 0.3.x ships Roboto TTF files under build/fonts/Roboto/.
    const fontsDir = join(process.cwd(), 'node_modules', 'pdfmake', 'build', 'fonts', 'Roboto');

    const fonts: TFontDictionary = {
      Roboto: {
        normal: join(fontsDir, 'Roboto-Regular.ttf'),
        bold: join(fontsDir, 'Roboto-Medium.ttf'),
        italics: join(fontsDir, 'Roboto-Italic.ttf'),
        bolditalics: join(fontsDir, 'Roboto-MediumItalic.ttf'),
      },
    };

    this.printer = new PdfPrinter(fonts);
    this.logger.log('PdfGeneratorService initialized with Roboto fonts');
  }

  /**
   * Generate an A4-format PDF invoice.
   *
   * Produces a professional layout suitable for printing on standard A4 paper.
   * Includes company header, document identification box, client info,
   * items table with alternating row colors, totals breakdown, and footer
   * with monto en letras, hash digest, and SUNAT response.
   *
   * @param data - Pre-processed invoice data with all amounts as plain numbers
   * @returns Buffer containing the generated PDF
   */
  async generateA4(data: PdfInvoiceData): Promise<Buffer> {
    this.logger.log(
      `Generating A4 PDF for ${data.tipoDocNombre} ${data.serie}-${data.correlativo}`,
    );

    data.qrDataUri = await this.generateQrDataUri(data);
    const docDefinition = buildA4Template(data);
    return this.generatePdfBuffer(docDefinition);
  }

  /**
   * Generate an 80mm ticket-format PDF invoice.
   *
   * Produces a compact layout optimized for thermal printers with 80mm paper.
   * Uses smaller fonts, center-aligned headers, and auto-height to
   * accommodate variable item counts without fixed page breaks.
   *
   * @param data - Pre-processed invoice data with all amounts as plain numbers
   * @returns Buffer containing the generated PDF
   */
  async generateTicket(data: PdfInvoiceData): Promise<Buffer> {
    this.logger.log(
      `Generating ticket PDF for ${data.tipoDocNombre} ${data.serie}-${data.correlativo}`,
    );

    data.qrDataUri = await this.generateQrDataUri(data);
    const docDefinition = buildTicketTemplate(data);
    return this.generatePdfBuffer(docDefinition);
  }

  /**
   * Generate QR code data URI for SUNAT CPE.
   *
   * Format: RUC|TipoDoc|Serie|Correlativo|IGV|Total|FechaEmision|TipoDocCliente|NumDocCliente|Hash
   * Date format in QR: dd/MM/yyyy (same as fechaEmision in PdfInvoiceData)
   */
  private async generateQrDataUri(data: PdfInvoiceData): Promise<string> {
    const qrContent = [
      data.companyRuc,
      data.tipoDoc,
      data.serie,
      data.correlativo,
      data.igv.toFixed(2),
      data.totalVenta.toFixed(2),
      data.fechaEmision,
      data.clienteTipoDoc,
      data.clienteNumDoc,
      data.xmlHash ?? '',
    ].join('|');

    try {
      return await QRCode.toDataURL(qrContent, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 150,
      });
    } catch (err) {
      this.logger.warn(`Failed to generate QR code: ${err instanceof Error ? err.message : err}`);
      return '';
    }
  }

  /**
   * Core method: creates a PDFKit document from a pdfmake definition
   * and collects the output stream into a Buffer.
   *
   * pdfmake 0.3.x's createPdfKitDocument returns a Promise that resolves
   * to a PDFKit.PDFDocument (a readable stream). We pipe it through chunk
   * collection and call .end() to finalize.
   *
   * @param docDefinition - A complete pdfmake document definition
   * @returns Buffer containing the raw PDF bytes
   */
  private async generatePdfBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        // createPdfKitDocument may be sync or async depending on pdfmake version.
        // We handle both cases by checking if the result is a promise.
        const result = this.printer.createPdfKitDocument(docDefinition);

        // pdfmake 0.3.x returns a Promise; older versions return the doc directly.
        const handleDoc = (doc: PDFKit.PDFDocument): void => {
          const chunks: Buffer[] = [];

          doc.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            this.logger.debug(`PDF generated: ${pdfBuffer.length} bytes`);
            resolve(pdfBuffer);
          });

          doc.on('error', (err: Error) => {
            this.logger.error(`PDF generation error: ${err.message}`);
            reject(err);
          });

          doc.end();
        };

        // Handle both sync and async createPdfKitDocument
        if (result instanceof Promise) {
          result.then(handleDoc).catch(reject);
        } else {
          handleDoc(result as unknown as PDFKit.PDFDocument);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown PDF generation error';
        this.logger.error(`Failed to create PDF document: ${message}`);
        reject(error);
      }
    });
  }
}
