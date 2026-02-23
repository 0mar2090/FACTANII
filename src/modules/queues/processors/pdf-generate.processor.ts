import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PdfGeneratorService } from '../../pdf-generator/pdf-generator.service.js';
import type { PdfInvoiceData, PdfInvoiceItem } from '../../pdf-generator/interfaces/pdf-data.interface.js';
import { amountToWords } from '../../../common/utils/amount-to-words.js';
import { QUEUE_PDF_GENERATE } from '../queues.constants.js';
import type { PdfGenerateJobData } from '../interfaces/index.js';

const TIPO_DOC_NOMBRES: Record<string, string> = {
  '01': 'FACTURA ELECTRÓNICA',
  '03': 'BOLETA DE VENTA ELECTRÓNICA',
  '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
  '08': 'NOTA DE DÉBITO ELECTRÓNICA',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  PEN: 'S/',
  USD: 'US$',
  EUR: '€',
};

@Processor(QUEUE_PDF_GENERATE, {
  concurrency: 5,
})
export class PdfGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfGenerateProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfGenerator: PdfGeneratorService,
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

    // 3. Map to PdfInvoiceData
    const pdfData: PdfInvoiceData = {
      companyRuc: company.ruc,
      companyRazonSocial: company.razonSocial,
      companyDireccion: company.direccion,
      companyUbigeo: company.ubigeo,
      tipoDoc: invoice.tipoDoc,
      tipoDocNombre: TIPO_DOC_NOMBRES[invoice.tipoDoc] ?? 'COMPROBANTE ELECTRÓNICO',
      serie: invoice.serie,
      correlativo: invoice.correlativo,
      fechaEmision: invoice.fechaEmision.toISOString().split('T')[0]!,
      fechaVencimiento: invoice.fechaVencimiento
        ? invoice.fechaVencimiento.toISOString().split('T')[0]!
        : undefined,
      moneda: invoice.moneda,
      monedaSimbolo: CURRENCY_SYMBOLS[invoice.moneda] ?? invoice.moneda,
      clienteTipoDoc: invoice.clienteTipoDoc,
      clienteNumDoc: invoice.clienteNumDoc,
      clienteNombre: invoice.clienteNombre,
      clienteDireccion: invoice.clienteDireccion ?? undefined,
      items: invoice.items.map((item, idx): PdfInvoiceItem => ({
        numero: idx + 1,
        cantidad: Number(item.cantidad),
        unidadMedida: item.unidadMedida,
        descripcion: item.descripcion,
        valorUnitario: Number(item.valorUnitario),
        igv: Number(item.igv),
        valorVenta: Number(item.valorVenta),
      })),
      opGravadas: Number(invoice.opGravadas),
      opExoneradas: Number(invoice.opExoneradas),
      opInafectas: Number(invoice.opInafectas),
      igv: Number(invoice.igv),
      isc: Number(invoice.isc),
      icbper: Number(invoice.icbper),
      totalVenta: Number(invoice.totalVenta),
      montoEnLetras: amountToWords(Number(invoice.totalVenta), invoice.moneda),
      xmlHash: invoice.xmlHash ?? undefined,
      sunatCode: invoice.sunatCode ?? undefined,
      sunatMessage: invoice.sunatMessage ?? undefined,
      formaPago: invoice.formaPago,
      motivoNota: invoice.motivoNota ?? undefined,
      docRefSerie: invoice.docRefSerie ?? undefined,
      docRefCorrelativo: invoice.docRefCorrelativo ?? undefined,
    };

    // 4. Generate PDF
    let pdfBuffer: Buffer;
    if (format === 'ticket') {
      pdfBuffer = await this.pdfGenerator.generateTicket(pdfData);
    } else {
      pdfBuffer = await this.pdfGenerator.generateA4(pdfData);
    }

    // 5. Store to local storage/pdfs/ directory
    const correlativoPadded = String(invoice.correlativo).padStart(8, '0');
    const pdfDir = join(process.cwd(), 'storage', 'pdfs', company.ruc);
    await mkdir(pdfDir, { recursive: true });
    const pdfFileName = `${invoice.serie}-${correlativoPadded}.pdf`;
    const pdfPath = join(pdfDir, pdfFileName);
    await writeFile(pdfPath, pdfBuffer);

    // 6. Update invoice.pdfUrl in DB
    const pdfUrl = `storage/pdfs/${company.ruc}/${pdfFileName}`;
    await this.prisma.client.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl },
    });

    this.logger.log(
      `PDF generated for invoice ${invoice.serie}-${correlativoPadded}: ${pdfUrl} (${pdfBuffer.length} bytes)`,
    );
  }
}
