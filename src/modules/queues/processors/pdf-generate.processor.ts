import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PdfGeneratorService } from '../../pdf-generator/pdf-generator.service.js';
import type { PdfInvoiceData, PdfInvoiceItem } from '../../pdf-generator/interfaces/pdf-data.interface.js';
import { amountToWords } from '../../../common/utils/amount-to-words.js';
import { TIPO_DOC_NOMBRES, CURRENCY_SYMBOLS } from '../../../common/constants/index.js';
import { QUEUE_PDF_GENERATE } from '../queues.constants.js';
import type { PdfGenerateJobData } from '../interfaces/index.js';

@Processor(QUEUE_PDF_GENERATE, {
  concurrency: 5,
})
export class PdfGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfGenerateProcessor.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly configService: ConfigService,
  ) {
    super();

    const accountId = this.configService.get<string>('R2_ACCOUNT_ID', '');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID', '');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY', '');
    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME', 'anii-media');
    this.publicUrl = this.configService.get<string>('R2_PUBLIC_URL', '');

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: accountId
        ? `https://${accountId}.r2.cloudflarestorage.com`
        : undefined,
      credentials: (accessKeyId && secretAccessKey)
        ? { accessKeyId, secretAccessKey }
        : undefined,
    });
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
      motivoDescripcion: invoice.motivoDescripcion ?? invoice.motivoNota ?? undefined,
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

    // 5. Upload to Cloudflare R2
    const correlativoPadded = String(invoice.correlativo).padStart(8, '0');
    const pdfFileName = `${invoice.serie}-${correlativoPadded}.pdf`;
    const r2Key = `pdfs/${company.ruc}/${pdfFileName}`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: r2Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }));

    // 6. Build public URL and update invoice.pdfUrl in DB
    const pdfUrl = this.publicUrl
      ? `${this.publicUrl}/${r2Key}`
      : r2Key;

    await this.prisma.client.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl },
    });

    this.logger.log(
      `PDF uploaded to R2 for invoice ${invoice.serie}-${correlativoPadded}: ${pdfUrl} (${pdfBuffer.length} bytes)`,
    );
  }
}
