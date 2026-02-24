import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { XmlBuilderService } from '../xml-builder/xml-builder.service.js';
import { XmlSignerService } from '../xml-signer/xml-signer.service.js';
import { SunatClientService } from '../sunat-client/sunat-client.service.js';
import { SunatGreClientService } from '../sunat-client/sunat-gre-client.service.js';
import { CdrProcessorService } from '../cdr-processor/cdr-processor.service.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { CompaniesService } from '../companies/companies.service.js';
import { PdfGeneratorService } from '../pdf-generator/pdf-generator.service.js';
import { BillingService } from '../billing/billing.service.js';
import type { PdfInvoiceData, PdfInvoiceItem } from '../pdf-generator/interfaces/pdf-data.interface.js';
import { XmlValidatorService } from '../xml-builder/validators/xml-validator.js';
import { createZipFromXml } from '../../common/utils/zip.js';
import {
  calculateItemTaxes,
  calculateInvoiceTotals,
  round2,
} from '../../common/utils/tax-calculator.js';
import { amountToWords } from '../../common/utils/amount-to-words.js';
import {
  TIPO_DOCUMENTO,
  RETENCION_RATES,
  PERCEPCION_RATES,
  TIPO_DOC_NOMBRES,
  CURRENCY_SYMBOLS,
} from '../../common/constants/index.js';
import { QUEUE_INVOICE_SEND, QUEUE_TICKET_POLL } from '../queues/queues.constants.js';
import type {
  XmlInvoiceData,
  XmlCreditNoteData,
  XmlDebitNoteData,
  XmlSummaryData,
  XmlVoidedData,
  XmlSummaryLine,
  XmlVoidedLine,
  XmlInvoiceItem,
  XmlCompany,
  XmlClient,
  XmlRetentionData,
  XmlRetentionLine,
  XmlPerceptionData,
  XmlPerceptionLine,
  XmlGuideData,
  XmlGuideItem,
} from '../xml-builder/interfaces/xml-builder.interfaces.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import type { CreateDebitNoteDto } from './dto/create-debit-note.dto.js';
import type { CreateSummaryDto } from './dto/create-summary.dto.js';
import type { CreateVoidedDto } from './dto/create-voided.dto.js';
import type { CreateRetentionDto } from './dto/create-retention.dto.js';
import type { CreatePerceptionDto } from './dto/create-perception.dto.js';
import type { CreateGuideDto } from './dto/create-guide.dto.js';
import type { InvoiceResponseDto, SummaryResponseDto } from './dto/invoice-response.dto.js';
import type { CompanyModel } from '../../generated/prisma/models/Company.js';
import type { InvoiceModel } from '../../generated/prisma/models/Invoice.js';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly xmlBuilder: XmlBuilderService,
    private readonly xmlSigner: XmlSignerService,
    private readonly sunatClient: SunatClientService,
    private readonly sunatGreClient: SunatGreClientService,
    private readonly cdrProcessor: CdrProcessorService,
    private readonly certificates: CertificatesService,
    private readonly companies: CompaniesService,
    private readonly xmlValidator: XmlValidatorService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly billing: BillingService,
    @InjectQueue(QUEUE_INVOICE_SEND) private readonly invoiceSendQueue: Queue,
    @InjectQueue(QUEUE_TICKET_POLL) private readonly ticketPollQueue: Queue,
  ) {}

  /**
   * Create, sign, and send a Factura (01) or Boleta (03) to SUNAT.
   *
   * Full orchestration:
   * 1. Validate input and calculate taxes
   * 2. Get next correlativo
   * 3. Build UBL 2.1 XML
   * 4. Sign XML with company's certificate
   * 5. Create ZIP
   * 6. Send to SUNAT
   * 7. Process CDR response
   * 8. Save to database
   */
  async createInvoice(
    companyId: string,
    dto: CreateInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    // 0. Pre-send validation
    this.xmlValidator.validateInvoice(dto);

    // 1. Load company, certificate, SOL credentials (includes quota enforcement)
    const { company, cert, ruc, solUser, solPass, xmlCompany } =
      await this.prepareDocumentContext(companyId);

    // 2. Calculate taxes for each item
    const tipoDoc = dto.tipoDoc;
    const moneda = dto.moneda ?? 'PEN';
    const tipoOperacion = dto.tipoOperacion ?? '0101';
    const formaPago: 'Contado' | 'Credito' =
      dto.formaPago === 'Credito' ? 'Credito' : 'Contado';

    const calculatedItems = dto.items.map((item) => {
      const tipoAfectacion = item.tipoAfectacion ?? '10';
      return {
        calc: calculateItemTaxes({
          cantidad: item.cantidad,
          valorUnitario: item.valorUnitario,
          tipoAfectacion,
          descuento: item.descuento,
          isc: item.isc,
          cantidadBolsasPlastico: item.cantidadBolsasPlastico,
        }),
        tipoAfectacion,
        dto: item,
      };
    });

    // 5. Calculate invoice totals
    const totals = calculateInvoiceTotals({
      items: calculatedItems.map((i) => i.calc),
      tiposAfectacion: calculatedItems.map((i) => i.tipoAfectacion),
      descuentoGlobal: dto.descuentoGlobal,
      otrosCargos: dto.otrosCargos,
    });

    // 6. Get next correlativo (atomic)
    const { serie, correlativo } = await this.getNextCorrelativo(
      companyId,
      tipoDoc,
      company,
    );

    // 7. Build XML, sign, send (wrapped to log correlativo gap on failure)
    try {
    const xmlItems: XmlInvoiceItem[] = calculatedItems.map((item) => ({
      cantidad: item.dto.cantidad,
      unidadMedida: item.dto.unidadMedida ?? 'NIU',
      descripcion: item.dto.descripcion,
      codigo: item.dto.codigo,
      codigoSunat: item.dto.codigoSunat,
      valorUnitario: item.calc.valorUnitario,
      precioUnitario: item.calc.precioUnitario,
      valorVenta: item.calc.valorVenta,
      tipoAfectacion: item.tipoAfectacion,
      igv: item.calc.igv,
      isc: item.calc.isc,
      icbper: item.calc.icbper,
      descuento: item.calc.descuento,
    }));

    // 8. Build XML
    const xmlClient: XmlClient = {
      tipoDocIdentidad: dto.clienteTipoDoc,
      numDocIdentidad: dto.clienteNumDoc,
      nombre: dto.clienteNombre,
      direccion: dto.clienteDireccion,
    };

    // Determine effective tipoOperacion (detracción overrides to '1001')
    const effectiveTipoOperacion = dto.codigoDetraccion ? '1001' : tipoOperacion;

    const invoiceData: XmlInvoiceData = {
      tipoDoc,
      serie,
      correlativo,
      tipoOperacion: effectiveTipoOperacion,
      fechaEmision: dto.fechaEmision,
      fechaVencimiento: dto.fechaVencimiento,
      moneda,
      company: xmlCompany,
      client: xmlClient,
      items: xmlItems,
      opGravadas: totals.opGravadas,
      opExoneradas: totals.opExoneradas,
      opInafectas: totals.opInafectas,
      opGratuitas: totals.opGratuitas,
      igv: totals.igv,
      isc: totals.isc,
      icbper: totals.icbper,
      otrosCargos: totals.otrosCargos,
      descuentoGlobal: totals.descuentoGlobal,
      totalVenta: totals.totalVenta,
      formaPago: {
        formaPago,
        cuotas: dto.cuotas?.map((c) => ({
          monto: c.monto,
          moneda: c.moneda ?? moneda,
          fechaPago: c.fechaPago,
        })),
      },
      detraccion: dto.codigoDetraccion ? {
        codigo: dto.codigoDetraccion,
        porcentaje: dto.porcentajeDetraccion ?? 0.12,
        monto: dto.montoDetraccion ?? 0,
        cuentaBN: dto.cuentaDetraccion ?? '',
      } : undefined,
      anticipos: dto.anticipos?.map((a) => ({
        tipoDoc: a.tipoDoc,
        serie: a.serie,
        correlativo: a.correlativo,
        moneda: a.moneda ?? moneda,
        monto: a.monto,
        fechaPago: a.fechaPago,
      })),
      documentosRelacionados: dto.documentosRelacionados?.map((d) => ({
        tipoDoc: d.tipoDoc,
        numero: d.numero,
      })),
      orderReferenceId: dto.orderReferenceId,
      montoEnLetras: amountToWords(totals.totalVenta, moneda),
    };

    const xmlContent = this.xmlBuilder.buildInvoice(invoiceData);

    // 9. Sign, ZIP, and send to SUNAT
    const signedXml = this.xmlSigner.sign(xmlContent, cert.pfxBuffer, cert.passphrase);
    const xmlFileName = `${company.ruc}-${tipoDoc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;

    const { status, sunatCode, sunatMessage, sunatNotes, cdrZip, xmlHash } =
      await this.signAndSendSoap(signedXml, xmlFileName, ruc, solUser, solPass, company.isBeta);

    // 10. Save to database
    const invoice = await this.prisma.client.invoice.create({
      data: {
        companyId,
        tipoDoc,
        serie,
        correlativo,
        tipoOperacion: effectiveTipoOperacion,
        fechaEmision: new Date(dto.fechaEmision),
        fechaVencimiento: dto.fechaVencimiento
          ? new Date(dto.fechaVencimiento)
          : null,
        clienteTipoDoc: dto.clienteTipoDoc,
        clienteNumDoc: dto.clienteNumDoc,
        clienteNombre: dto.clienteNombre,
        clienteDireccion: dto.clienteDireccion,
        clienteEmail: dto.clienteEmail,
        moneda,
        opGravadas: totals.opGravadas,
        opExoneradas: totals.opExoneradas,
        opInafectas: totals.opInafectas,
        opGratuitas: totals.opGratuitas,
        igv: totals.igv,
        isc: totals.isc,
        icbper: totals.icbper,
        otrosCargos: totals.otrosCargos,
        descuentoGlobal: totals.descuentoGlobal,
        totalVenta: totals.totalVenta,
        formaPago,
        cuotas: dto.cuotas?.map((c) => ({ monto: c.monto, moneda: c.moneda, fechaPago: c.fechaPago })) ?? undefined,
        xmlContent: signedXml,
        xmlHash,
        xmlSigned: true,
        status,
        sunatCode,
        sunatMessage,
        sunatNotes: sunatNotes ?? undefined,
        cdrZip: cdrZip ? new Uint8Array(cdrZip) : undefined,
        sentAt: status !== 'PENDING' ? new Date() : undefined,
        attempts: status !== 'PENDING' ? 1 : 0,
        lastAttemptAt: new Date(),
        items: {
          create: calculatedItems.map((item) => ({
            cantidad: item.dto.cantidad,
            unidadMedida: item.dto.unidadMedida ?? 'NIU',
            descripcion: item.dto.descripcion,
            codigo: item.dto.codigo,
            codigoSunat: item.dto.codigoSunat,
            valorUnitario: item.calc.valorUnitario,
            precioUnitario: item.calc.precioUnitario,
            valorVenta: item.calc.valorVenta,
            tipoAfectacion: item.tipoAfectacion,
            igv: item.calc.igv,
            isc: item.calc.isc,
            icbper: item.calc.icbper,
            descuento: item.calc.descuento,
          })),
        },
      },
    });

    this.logger.log(
      `Invoice created: ${serie}-${correlativo} (${tipoDoc}) status=${status} sunat=${sunatCode ?? 'N/A'}`,
    );

    // Increment billing quota counter (fire-and-forget)
    void this.billing.incrementInvoiceCount(companyId);

    return this.toResponseDto(invoice);
    } catch (error) {
      this.logger.warn(`Correlativo gap: ${serie}-${correlativo} was allocated but document creation failed`);
      throw error;
    }
  }

  /**
   * Create, sign, and send a Nota de Crédito (07) to SUNAT.
   */
  async createCreditNote(
    companyId: string,
    dto: CreateCreditNoteDto,
  ): Promise<InvoiceResponseDto> {
    // 0. Pre-send validation
    this.xmlValidator.validateCreditNote(dto);

    // Validate: NC referencing a Factura requires client with RUC
    if (dto.docRefTipo === '01' && dto.clienteTipoDoc !== '6') {
      throw new BadRequestException(
        'Nota de Crédito que referencia una Factura requiere cliente con RUC (tipo documento 6)',
      );
    }

    const { company, cert, ruc, solUser, solPass, xmlCompany } =
      await this.prepareDocumentContext(companyId);
    const moneda = dto.moneda ?? 'PEN';
    const tipoDoc = TIPO_DOCUMENTO.NOTA_CREDITO;

    // Determine serie based on referenced document type
    const serieName = dto.docRefTipo === '01'
      ? company.serieNCFactura
      : company.serieNCBoleta;
    const { serie, correlativo } = await this.getNextCorrelativo(
      companyId,
      tipoDoc,
      company,
      serieName,
    );

    // Build XML, sign, send (wrapped to log correlativo gap on failure)
    try {
    const calculatedItems = dto.items.map((item) => {
      const tipoAfectacion = item.tipoAfectacion ?? '10';
      return {
        calc: calculateItemTaxes({
          cantidad: item.cantidad,
          valorUnitario: item.valorUnitario,
          tipoAfectacion,
          descuento: item.descuento,
          isc: item.isc,
          cantidadBolsasPlastico: item.cantidadBolsasPlastico,
        }),
        tipoAfectacion,
        dto: item,
      };
    });

    const totals = calculateInvoiceTotals({
      items: calculatedItems.map((i) => i.calc),
      tiposAfectacion: calculatedItems.map((i) => i.tipoAfectacion),
    });

    const xmlItems: XmlInvoiceItem[] = calculatedItems.map((item) => ({
      cantidad: item.dto.cantidad,
      unidadMedida: item.dto.unidadMedida ?? 'NIU',
      descripcion: item.dto.descripcion,
      codigo: item.dto.codigo,
      codigoSunat: item.dto.codigoSunat,
      valorUnitario: item.calc.valorUnitario,
      precioUnitario: item.calc.precioUnitario,
      valorVenta: item.calc.valorVenta,
      tipoAfectacion: item.tipoAfectacion,
      igv: item.calc.igv,
      isc: item.calc.isc,
      icbper: item.calc.icbper,
      descuento: item.calc.descuento,
    }));

    const xmlClient: XmlClient = {
      tipoDocIdentidad: dto.clienteTipoDoc,
      numDocIdentidad: dto.clienteNumDoc,
      nombre: dto.clienteNombre,
      direccion: dto.clienteDireccion,
    };

    const noteData: XmlCreditNoteData = {
      serie,
      correlativo,
      fechaEmision: dto.fechaEmision,
      moneda,
      docRefTipo: dto.docRefTipo,
      docRefSerie: dto.docRefSerie,
      docRefCorrelativo: dto.docRefCorrelativo,
      motivoNota: dto.motivoNota,
      motivoDescripcion: dto.motivoDescripcion,
      company: xmlCompany,
      client: xmlClient,
      items: xmlItems,
      opGravadas: totals.opGravadas,
      opExoneradas: totals.opExoneradas,
      opInafectas: totals.opInafectas,
      opGratuitas: totals.opGratuitas,
      igv: totals.igv,
      isc: totals.isc,
      icbper: totals.icbper,
      totalVenta: totals.totalVenta,
      montoEnLetras: amountToWords(totals.totalVenta, moneda),
    };

    const xmlContent = this.xmlBuilder.buildCreditNote(noteData);
    const signedXml = this.xmlSigner.sign(xmlContent, cert.pfxBuffer, cert.passphrase);
    const xmlFileName = `${company.ruc}-${tipoDoc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;

    const { status, sunatCode, sunatMessage, sunatNotes, cdrZip, xmlHash } =
      await this.signAndSendSoap(signedXml, xmlFileName, ruc, solUser, solPass, company.isBeta);

    const invoice = await this.prisma.client.invoice.create({
      data: {
        companyId,
        tipoDoc,
        serie,
        correlativo,
        tipoOperacion: '0101',
        fechaEmision: new Date(dto.fechaEmision),
        clienteTipoDoc: dto.clienteTipoDoc,
        clienteNumDoc: dto.clienteNumDoc,
        clienteNombre: dto.clienteNombre,
        clienteDireccion: dto.clienteDireccion,
        clienteEmail: dto.clienteEmail,
        moneda,
        opGravadas: totals.opGravadas,
        opExoneradas: totals.opExoneradas,
        opInafectas: totals.opInafectas,
        opGratuitas: totals.opGratuitas,
        igv: totals.igv,
        isc: totals.isc,
        icbper: totals.icbper,
        totalVenta: totals.totalVenta,
        docRefTipo: dto.docRefTipo,
        docRefSerie: dto.docRefSerie,
        docRefCorrelativo: dto.docRefCorrelativo,
        motivoNota: dto.motivoNota,
        xmlContent: signedXml,
        xmlHash,
        xmlSigned: true,
        status,
        sunatCode,
        sunatMessage,
        sunatNotes: sunatNotes ?? undefined,
        cdrZip: cdrZip ? new Uint8Array(cdrZip) : undefined,
        sentAt: status !== 'PENDING' ? new Date() : undefined,
        attempts: status !== 'PENDING' ? 1 : 0,
        lastAttemptAt: new Date(),
        items: {
          create: calculatedItems.map((item) => ({
            cantidad: item.dto.cantidad,
            unidadMedida: item.dto.unidadMedida ?? 'NIU',
            descripcion: item.dto.descripcion,
            codigo: item.dto.codigo,
            codigoSunat: item.dto.codigoSunat,
            valorUnitario: item.calc.valorUnitario,
            precioUnitario: item.calc.precioUnitario,
            valorVenta: item.calc.valorVenta,
            tipoAfectacion: item.tipoAfectacion,
            igv: item.calc.igv,
            isc: item.calc.isc,
            icbper: item.calc.icbper,
            descuento: item.calc.descuento,
          })),
        },
      },
    });

    this.logger.log(`Credit Note created: ${serie}-${correlativo} status=${status}`);

    void this.billing.incrementInvoiceCount(companyId);

    return this.toResponseDto(invoice);
    } catch (error) {
      this.logger.warn(`Correlativo gap: ${serie}-${correlativo} was allocated but document creation failed`);
      throw error;
    }
  }

  /**
   * Create, sign, and send a Nota de Débito (08) to SUNAT.
   */
  async createDebitNote(
    companyId: string,
    dto: CreateDebitNoteDto,
  ): Promise<InvoiceResponseDto> {
    // 0. Pre-send validation
    this.xmlValidator.validateDebitNote(dto);

    // Validate: ND referencing a Factura requires client with RUC
    if (dto.docRefTipo === '01' && dto.clienteTipoDoc !== '6') {
      throw new BadRequestException(
        'Nota de Débito que referencia una Factura requiere cliente con RUC (tipo documento 6)',
      );
    }

    const { company, cert, ruc, solUser, solPass, xmlCompany } =
      await this.prepareDocumentContext(companyId);
    const moneda = dto.moneda ?? 'PEN';
    const tipoDoc = TIPO_DOCUMENTO.NOTA_DEBITO;

    const serieName = dto.docRefTipo === '01'
      ? company.serieNDFactura
      : company.serieNDBoleta;
    const { serie, correlativo } = await this.getNextCorrelativo(
      companyId,
      tipoDoc,
      company,
      serieName,
    );

    // Build XML, sign, send (wrapped to log correlativo gap on failure)
    try {
    const calculatedItems = dto.items.map((item) => {
      const tipoAfectacion = item.tipoAfectacion ?? '10';
      return {
        calc: calculateItemTaxes({
          cantidad: item.cantidad,
          valorUnitario: item.valorUnitario,
          tipoAfectacion,
          descuento: item.descuento,
          isc: item.isc,
          cantidadBolsasPlastico: item.cantidadBolsasPlastico,
        }),
        tipoAfectacion,
        dto: item,
      };
    });

    const totals = calculateInvoiceTotals({
      items: calculatedItems.map((i) => i.calc),
      tiposAfectacion: calculatedItems.map((i) => i.tipoAfectacion),
    });

    const xmlItems: XmlInvoiceItem[] = calculatedItems.map((item) => ({
      cantidad: item.dto.cantidad,
      unidadMedida: item.dto.unidadMedida ?? 'NIU',
      descripcion: item.dto.descripcion,
      codigo: item.dto.codigo,
      codigoSunat: item.dto.codigoSunat,
      valorUnitario: item.calc.valorUnitario,
      precioUnitario: item.calc.precioUnitario,
      valorVenta: item.calc.valorVenta,
      tipoAfectacion: item.tipoAfectacion,
      igv: item.calc.igv,
      isc: item.calc.isc,
      icbper: item.calc.icbper,
      descuento: item.calc.descuento,
    }));

    const xmlClient: XmlClient = {
      tipoDocIdentidad: dto.clienteTipoDoc,
      numDocIdentidad: dto.clienteNumDoc,
      nombre: dto.clienteNombre,
      direccion: dto.clienteDireccion,
    };

    const noteData: XmlDebitNoteData = {
      serie,
      correlativo,
      fechaEmision: dto.fechaEmision,
      moneda,
      docRefTipo: dto.docRefTipo,
      docRefSerie: dto.docRefSerie,
      docRefCorrelativo: dto.docRefCorrelativo,
      motivoNota: dto.motivoNota,
      motivoDescripcion: dto.motivoDescripcion,
      company: xmlCompany,
      client: xmlClient,
      items: xmlItems,
      opGravadas: totals.opGravadas,
      opExoneradas: totals.opExoneradas,
      opInafectas: totals.opInafectas,
      opGratuitas: totals.opGratuitas,
      igv: totals.igv,
      isc: totals.isc,
      icbper: totals.icbper,
      totalVenta: totals.totalVenta,
      montoEnLetras: amountToWords(totals.totalVenta, moneda),
    };

    const xmlContent = this.xmlBuilder.buildDebitNote(noteData);
    const signedXml = this.xmlSigner.sign(xmlContent, cert.pfxBuffer, cert.passphrase);
    const xmlFileName = `${company.ruc}-${tipoDoc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;

    const { status, sunatCode, sunatMessage, sunatNotes, cdrZip, xmlHash } =
      await this.signAndSendSoap(signedXml, xmlFileName, ruc, solUser, solPass, company.isBeta);

    const invoice = await this.prisma.client.invoice.create({
      data: {
        companyId,
        tipoDoc,
        serie,
        correlativo,
        tipoOperacion: '0101',
        fechaEmision: new Date(dto.fechaEmision),
        clienteTipoDoc: dto.clienteTipoDoc,
        clienteNumDoc: dto.clienteNumDoc,
        clienteNombre: dto.clienteNombre,
        clienteDireccion: dto.clienteDireccion,
        clienteEmail: dto.clienteEmail,
        moneda,
        opGravadas: totals.opGravadas,
        opExoneradas: totals.opExoneradas,
        opInafectas: totals.opInafectas,
        opGratuitas: totals.opGratuitas,
        igv: totals.igv,
        isc: totals.isc,
        icbper: totals.icbper,
        totalVenta: totals.totalVenta,
        docRefTipo: dto.docRefTipo,
        docRefSerie: dto.docRefSerie,
        docRefCorrelativo: dto.docRefCorrelativo,
        motivoNota: dto.motivoNota,
        xmlContent: signedXml,
        xmlHash,
        xmlSigned: true,
        status,
        sunatCode,
        sunatMessage,
        sunatNotes: sunatNotes ?? undefined,
        cdrZip: cdrZip ? new Uint8Array(cdrZip) : undefined,
        sentAt: status !== 'PENDING' ? new Date() : undefined,
        attempts: status !== 'PENDING' ? 1 : 0,
        lastAttemptAt: new Date(),
        items: {
          create: calculatedItems.map((item) => ({
            cantidad: item.dto.cantidad,
            unidadMedida: item.dto.unidadMedida ?? 'NIU',
            descripcion: item.dto.descripcion,
            codigo: item.dto.codigo,
            codigoSunat: item.dto.codigoSunat,
            valorUnitario: item.calc.valorUnitario,
            precioUnitario: item.calc.precioUnitario,
            valorVenta: item.calc.valorVenta,
            tipoAfectacion: item.tipoAfectacion,
            igv: item.calc.igv,
            isc: item.calc.isc,
            icbper: item.calc.icbper,
            descuento: item.calc.descuento,
          })),
        },
      },
    });

    this.logger.log(`Debit Note created: ${serie}-${correlativo} status=${status}`);

    void this.billing.incrementInvoiceCount(companyId);

    return this.toResponseDto(invoice);
    } catch (error) {
      this.logger.warn(`Correlativo gap: ${serie}-${correlativo} was allocated but document creation failed`);
      throw error;
    }
  }

  /**
   * List invoices for a company with optional filters.
   */
  async findAll(
    companyId: string,
    filters?: {
      tipoDoc?: string;
      status?: string;
      desde?: string;
      hasta?: string;
      clienteNumDoc?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page ?? 1;
    const limit = Math.min(filters?.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: {
      companyId: string;
      tipoDoc?: string;
      status?: string;
      clienteNumDoc?: string;
      fechaEmision?: { gte?: Date; lte?: Date };
    } = { companyId };
    if (filters?.tipoDoc) where.tipoDoc = filters.tipoDoc;
    if (filters?.status) where.status = filters.status;
    if (filters?.clienteNumDoc) where.clienteNumDoc = filters.clienteNumDoc;
    if (filters?.desde || filters?.hasta) {
      where.fechaEmision = {};
      if (filters.desde) where.fechaEmision.gte = new Date(filters.desde);
      if (filters?.hasta) where.fechaEmision.lte = new Date(filters.hasta);
    }

    const [invoices, total] = await Promise.all([
      this.prisma.client.invoice.findMany({
        where,
        select: {
          id: true,
          tipoDoc: true,
          serie: true,
          correlativo: true,
          fechaEmision: true,
          clienteNombre: true,
          clienteNumDoc: true,
          moneda: true,
          totalVenta: true,
          status: true,
          sunatCode: true,
          sunatMessage: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.client.invoice.count({ where }),
    ]);

    return {
      data: invoices.map((inv) => ({
        ...inv,
        totalVenta: Number(inv.totalVenta),
        fechaEmision: inv.fechaEmision.toISOString().split('T')[0],
        createdAt: inv.createdAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single invoice by ID.
   */
  async findById(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { items: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  /**
   * Get the signed XML content of an invoice.
   */
  async getXml(companyId: string, invoiceId: string): Promise<string> {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, companyId },
      select: { xmlContent: true },
    });

    if (!invoice?.xmlContent) {
      throw new NotFoundException('XML not found for this invoice');
    }

    return invoice.xmlContent;
  }

  /**
   * Get the CDR ZIP of an invoice.
   */
  async getCdr(companyId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, companyId },
      select: { cdrZip: true },
    });

    if (!invoice?.cdrZip) {
      throw new NotFoundException('CDR not found for this invoice');
    }

    return Buffer.from(invoice.cdrZip);
  }

  /**
   * Get or generate the PDF for an invoice.
   * Reads from disk if already generated, otherwise generates on-the-fly.
   */
  async getPdf(
    companyId: string,
    invoiceId: string,
    format: 'a4' | 'ticket' = 'a4',
  ): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { items: true, company: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Try reading from disk if already generated
    if (invoice.pdfUrl) {
      try {
        const fullPath = join(process.cwd(), invoice.pdfUrl);
        const buffer = await readFile(fullPath);
        const filename = invoice.pdfUrl.split('/').pop()!;
        return { buffer, filename };
      } catch {
        // File missing on disk — regenerate below
        this.logger.warn(`PDF file missing at ${invoice.pdfUrl}, regenerating`);
      }
    }

    // Generate on-the-fly
    const company = invoice.company;

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
      digestValue: invoice.xmlContent
        ? this.xmlSigner.getDigestValue(invoice.xmlContent)
        : undefined,
      sunatCode: invoice.sunatCode ?? undefined,
      sunatMessage: invoice.sunatMessage ?? undefined,
      formaPago: invoice.formaPago,
      motivoNota: invoice.motivoNota ?? undefined,
      docRefSerie: invoice.docRefSerie ?? undefined,
      docRefCorrelativo: invoice.docRefCorrelativo ?? undefined,
    };

    const buffer =
      format === 'ticket'
        ? await this.pdfGenerator.generateTicket(pdfData)
        : await this.pdfGenerator.generateA4(pdfData);

    const correlativoPadded = String(invoice.correlativo).padStart(8, '0');
    const filename = `${invoice.serie}-${correlativoPadded}.pdf`;

    return { buffer, filename };
  }

  /**
   * Create, sign, and send a Resumen Diario (RC) to SUNAT.
   *
   * Summary documents are sent asynchronously — SUNAT returns a ticket
   * that must be polled via getStatus to retrieve the CDR.
   */
  async createSummary(
    companyId: string,
    dto: CreateSummaryDto,
  ): Promise<SummaryResponseDto> {
    // Pre-send validation
    this.xmlValidator.validateSummary(dto);

    const { company, cert, ruc, solUser, solPass, xmlCompany } =
      await this.prepareDocumentContext(companyId, true);

    const fechaEmision = dto.fechaEmision ?? new Date().toISOString().split('T')[0]!;
    const moneda = dto.moneda ?? 'PEN';

    // Get next correlativo for RC (atomic)
    const dateStr = fechaEmision.replace(/-/g, '');
    const rcSerieKey = `RC-${dateStr}`;
    const correlativo = await this.atomicIncrementCorrelativo(companyId, rcSerieKey);

    // Build XML, sign, send (wrapped to log correlativo gap on failure)
    try {
    // Build summary lines
    const summaryLines: XmlSummaryLine[] = dto.items.map((item) => ({
      tipoDoc: item.tipoDoc,
      serie: item.serie,
      correlativo: item.correlativo,
      clienteTipoDoc: item.clienteTipoDoc,
      clienteNumDoc: item.clienteNumDoc,
      estado: item.estado,
      moneda,
      totalVenta: item.totalVenta,
      opGravadas: item.opGravadas,
      opExoneradas: item.opExoneradas,
      opInafectas: item.opInafectas,
      opGratuitas: item.opGratuitas ?? 0,
      otrosCargos: item.otrosCargos ?? 0,
      igv: item.igv,
      isc: item.isc ?? 0,
      icbper: item.icbper ?? 0,
      docRefTipo: item.docRefTipo,
      docRefSerie: item.docRefSerie,
      docRefCorrelativo: item.docRefCorrelativo,
    }));

    const summaryData: XmlSummaryData = {
      correlativo,
      fechaReferencia: dto.fechaReferencia,
      fechaEmision,
      company: xmlCompany,
      items: summaryLines,
    };

    // Build XML
    const xmlContent = this.xmlBuilder.buildSummary(summaryData);

    // Sign XML
    const signedXml = this.xmlSigner.sign(xmlContent, cert.pfxBuffer, cert.passphrase);

    // Create ZIP: {RUC}-RC-{YYYYMMDD}-{NNNNN}.zip
    const summaryId = `RC-${dateStr}-${correlativo.toString().padStart(5, '0')}`;
    const xmlFileName = `${company.ruc}-${summaryId}.xml`;
    const zipFileName = xmlFileName.replace('.xml', '.zip');
    const zipBuffer = await createZipFromXml(signedXml, xmlFileName);

    // Persist Invoice record so ticket-poll processor can update it
    const xmlHash = this.xmlSigner.getXmlHash(signedXml);
    const invoice = await this.prisma.client.invoice.create({
      data: {
        companyId,
        tipoDoc: 'RC',
        serie: rcSerieKey,
        correlativo,
        fechaEmision: new Date(fechaEmision),
        clienteTipoDoc: '6',
        clienteNumDoc: company.ruc,
        clienteNombre: company.razonSocial,
        moneda,
        totalVenta: summaryLines.reduce((s, i) => s + i.totalVenta, 0),
        xmlContent: signedXml,
        xmlHash,
        xmlSigned: true,
        status: 'SENDING',
      },
    });

    // Send to SUNAT (async — returns ticket)
    let ticket: string | undefined;
    let status = 'SENDING';
    let sunatMessage: string | undefined;

    try {
      const result = await this.sunatClient.sendSummary(
        zipBuffer, zipFileName, ruc, solUser, solPass, company.isBeta,
      );

      if (result.success && result.ticket) {
        ticket = result.ticket;
        status = 'QUEUED';
        sunatMessage = `Ticket: ${result.ticket}`;
      } else {
        status = 'REJECTED';
        sunatMessage = result.message;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SUNAT sendSummary failed for ${summaryId}: ${msg}`);
      status = 'PENDING';
      sunatMessage = msg;
    }

    // Update persisted record with send result
    const updated = await this.prisma.client.invoice.update({
      where: { id: invoice.id },
      data: { status, sunatMessage },
    });

    this.logger.log(`Summary created: ${summaryId} status=${status} ticket=${ticket ?? 'N/A'}`);

    // Enqueue ticket polling if we got a ticket
    if (ticket) {
      void this.ticketPollQueue.add('poll', {
        ticket,
        invoiceId: invoice.id,
        companyId,
        ruc,
        solUser,
        solPass,
        isBeta: company.isBeta,
        documentType: 'summary',
      } satisfies import('../queues/interfaces/index.js').TicketPollJobData);
    }

    return {
      ...this.toResponseDto(updated),
      ticket,
      sunatDocumentId: summaryId,
    };
    } catch (error) {
      this.logger.warn(`Correlativo gap: ${rcSerieKey}-${correlativo} was allocated but document creation failed`);
      throw error;
    }
  }

  /**
   * Create, sign, and send a Comunicación de Baja (RA) to SUNAT.
   *
   * Voided documents are sent asynchronously — SUNAT returns a ticket
   * that must be polled via getStatus to retrieve the CDR.
   */
  async createVoided(
    companyId: string,
    dto: CreateVoidedDto,
  ): Promise<SummaryResponseDto> {
    // Pre-send validation
    this.xmlValidator.validateVoided(dto);

    const { company, cert, ruc, solUser, solPass, xmlCompany } =
      await this.prepareDocumentContext(companyId, true);

    const fechaEmision = dto.fechaEmision ?? new Date().toISOString().split('T')[0]!;

    // Get next correlativo for RA (atomic)
    const dateStr = fechaEmision.replace(/-/g, '');
    const raSerieKey = `RA-${dateStr}`;
    const correlativo = await this.atomicIncrementCorrelativo(companyId, raSerieKey);

    // Build XML, sign, send (wrapped to log correlativo gap on failure)
    try {
    // Build voided lines
    const voidedLines: XmlVoidedLine[] = dto.items.map((item) => ({
      tipoDoc: item.tipoDoc,
      serie: item.serie,
      correlativo: item.correlativo,
      motivo: item.motivo,
    }));

    const voidedData: XmlVoidedData = {
      correlativo,
      fechaReferencia: dto.fechaReferencia,
      fechaEmision,
      company: xmlCompany,
      items: voidedLines,
    };

    // Build XML
    const xmlContent = this.xmlBuilder.buildVoided(voidedData);

    // Sign XML
    const signedXml = this.xmlSigner.sign(xmlContent, cert.pfxBuffer, cert.passphrase);

    // Create ZIP: {RUC}-RA-{YYYYMMDD}-{NNNNN}.zip
    const voidedId = `RA-${dateStr}-${correlativo.toString().padStart(5, '0')}`;
    const xmlFileName = `${company.ruc}-${voidedId}.xml`;
    const zipFileName = xmlFileName.replace('.xml', '.zip');
    const zipBuffer = await createZipFromXml(signedXml, xmlFileName);

    // Persist Invoice record so ticket-poll processor can update it
    const xmlHash = this.xmlSigner.getXmlHash(signedXml);
    const invoice = await this.prisma.client.invoice.create({
      data: {
        companyId,
        tipoDoc: 'RA',
        serie: raSerieKey,
        correlativo,
        fechaEmision: new Date(fechaEmision),
        clienteTipoDoc: '6',
        clienteNumDoc: company.ruc,
        clienteNombre: company.razonSocial,
        moneda: 'PEN',
        totalVenta: 0,
        xmlContent: signedXml,
        xmlHash,
        xmlSigned: true,
        status: 'SENDING',
      },
    });

    // Send to SUNAT (async — returns ticket)
    let ticket: string | undefined;
    let status = 'SENDING';
    let sunatMessage: string | undefined;

    try {
      const result = await this.sunatClient.sendSummary(
        zipBuffer, zipFileName, ruc, solUser, solPass, company.isBeta,
      );

      if (result.success && result.ticket) {
        ticket = result.ticket;
        status = 'QUEUED';
        sunatMessage = `Ticket: ${result.ticket}`;
      } else {
        status = 'REJECTED';
        sunatMessage = result.message;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SUNAT sendSummary failed for ${voidedId}: ${msg}`);
      status = 'PENDING';
      sunatMessage = msg;
    }

    // Update persisted record with send result
    const updated = await this.prisma.client.invoice.update({
      where: { id: invoice.id },
      data: { status, sunatMessage },
    });

    this.logger.log(`Voided created: ${voidedId} status=${status} ticket=${ticket ?? 'N/A'}`);

    // Enqueue ticket polling if we got a ticket
    if (ticket) {
      void this.ticketPollQueue.add('poll', {
        ticket,
        invoiceId: invoice.id,
        companyId,
        ruc,
        solUser,
        solPass,
        isBeta: company.isBeta,
        documentType: 'voided',
      } satisfies import('../queues/interfaces/index.js').TicketPollJobData);
    }

    return {
      ...this.toResponseDto(updated),
      ticket,
      sunatDocumentId: voidedId,
    };
    } catch (error) {
      this.logger.warn(`Correlativo gap: ${raSerieKey}-${correlativo} was allocated but document creation failed`);
      throw error;
    }
  }

  /**
   * Create, sign, and send a Comprobante de Retención (20) to SUNAT.
   */
  async createRetention(
    companyId: string,
    dto: CreateRetentionDto,
  ): Promise<InvoiceResponseDto> {
    this.xmlValidator.validateRetention(dto);

    const { company, cert, ruc, solUser, solPass, xmlCompany } =
      await this.prepareDocumentContext(companyId);

    const tipoDoc = TIPO_DOCUMENTO.RETENCION;
    const moneda = 'PEN';
    const tasaRetencion = RETENCION_RATES[dto.regimenRetencion] ?? 0.03;

    const serieRetencion = company.serieRetencion;
    const { serie, correlativo } = await this.getNextCorrelativo(
      companyId, tipoDoc, company, serieRetencion,
    );

    // Build XML, sign, send (wrapped to log correlativo gap on failure)
    try {
    // Calculate retention amounts per item
    const retentionItems: XmlRetentionLine[] = dto.items.map((item) => {
      const importeRetenido = round2(item.importeTotal * tasaRetencion);
      const importePagado = round2(item.importeTotal - importeRetenido);
      return {
        tipoDocRelacionado: item.tipoDocRelacionado,
        serieDocRelacionado: item.serieDoc,
        correlativoDocRelacionado: item.correlativoDoc,
        fechaDocRelacionado: item.fechaDoc,
        moneda: item.moneda ?? moneda,
        importeTotal: item.importeTotal,
        fechaPago: item.fechaPago,
        importeRetenido,
        importePagado,
        tipoCambio: item.tipoCambio,
      };
    });

    const totalRetenido = round2(retentionItems.reduce((s, i) => s + i.importeRetenido, 0));
    const totalPagado = round2(retentionItems.reduce((s, i) => s + i.importePagado, 0));

    const xmlProveedor: XmlClient = {
      tipoDocIdentidad: dto.proveedorTipoDoc,
      numDocIdentidad: dto.proveedorNumDoc,
      nombre: dto.proveedorNombre,
      direccion: dto.proveedorDireccion,
    };

    const retentionData: XmlRetentionData = {
      serie, correlativo,
      fechaEmision: dto.fechaEmision,
      regimenRetencion: dto.regimenRetencion,
      tasaRetencion,
      company: xmlCompany,
      proveedor: xmlProveedor,
      items: retentionItems,
      totalRetenido, totalPagado, moneda,
    };

    const xmlContent = this.xmlBuilder.buildRetention(retentionData);
    const signedXml = this.xmlSigner.sign(xmlContent, cert.pfxBuffer, cert.passphrase);
    const xmlFileName = `${company.ruc}-${tipoDoc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;

    const { status, sunatCode, sunatMessage, sunatNotes, cdrZip, xmlHash } =
      await this.signAndSendSoap(signedXml, xmlFileName, ruc, solUser, solPass, company.isBeta, 'retention');

    const totalVenta = round2(retentionItems.reduce((s, i) => s + i.importeTotal, 0));

    const invoice = await this.prisma.client.invoice.create({
      data: {
        companyId,
        tipoDoc,
        serie,
        correlativo,
        tipoOperacion: tipoDoc, // '20' for retention (no Cat 51 code applies)
        fechaEmision: new Date(dto.fechaEmision),
        clienteTipoDoc: dto.proveedorTipoDoc,
        clienteNumDoc: dto.proveedorNumDoc,
        clienteNombre: dto.proveedorNombre,
        moneda,
        totalVenta,
        xmlContent: signedXml,
        xmlHash,
        xmlSigned: true,
        status,
        sunatCode,
        sunatMessage,
        sunatNotes: sunatNotes ?? undefined,
        cdrZip: cdrZip ? new Uint8Array(cdrZip) : undefined,
        sentAt: status !== 'PENDING' ? new Date() : undefined,
        attempts: status !== 'PENDING' ? 1 : 0,
        lastAttemptAt: new Date(),
      },
    });

    this.logger.log(`Retention created: ${serie}-${correlativo} status=${status}`);
    void this.billing.incrementInvoiceCount(companyId);
    return this.toResponseDto(invoice);
    } catch (error) {
      this.logger.warn(`Correlativo gap: ${serie}-${correlativo} was allocated but document creation failed`);
      throw error;
    }
  }

  /**
   * Create, sign, and send a Comprobante de Percepción (40) to SUNAT.
   */
  async createPerception(
    companyId: string,
    dto: CreatePerceptionDto,
  ): Promise<InvoiceResponseDto> {
    this.xmlValidator.validatePerception(dto);

    const { company, cert, ruc, solUser, solPass, xmlCompany } =
      await this.prepareDocumentContext(companyId);

    const tipoDoc = TIPO_DOCUMENTO.PERCEPCION;
    const moneda = 'PEN';
    const tasaPercepcion = PERCEPCION_RATES[dto.regimenPercepcion] ?? 0.02;

    const seriePercepcion = company.seriePercepcion;
    const { serie, correlativo } = await this.getNextCorrelativo(
      companyId, tipoDoc, company, seriePercepcion,
    );

    // Build XML, sign, send (wrapped to log correlativo gap on failure)
    try {
    // Calculate perception amounts per item
    const perceptionItems: XmlPerceptionLine[] = dto.items.map((item) => {
      const importePercibido = round2(item.importeTotal * tasaPercepcion);
      const importeCobrado = round2(item.importeTotal + importePercibido);
      return {
        tipoDocRelacionado: item.tipoDocRelacionado,
        serieDocRelacionado: item.serieDoc,
        correlativoDocRelacionado: item.correlativoDoc,
        fechaDocRelacionado: item.fechaDoc,
        moneda: item.moneda ?? moneda,
        importeTotal: item.importeTotal,
        fechaCobro: item.fechaCobro,
        importePercibido,
        importeCobrado,
        tipoCambio: item.tipoCambio,
      };
    });

    const totalPercibido = round2(perceptionItems.reduce((s, i) => s + i.importePercibido, 0));
    const totalCobrado = round2(perceptionItems.reduce((s, i) => s + i.importeCobrado, 0));

    const xmlCliente: XmlClient = {
      tipoDocIdentidad: dto.clienteTipoDoc,
      numDocIdentidad: dto.clienteNumDoc,
      nombre: dto.clienteNombre,
      direccion: dto.clienteDireccion,
    };

    const perceptionData: XmlPerceptionData = {
      serie, correlativo,
      fechaEmision: dto.fechaEmision,
      regimenPercepcion: dto.regimenPercepcion,
      tasaPercepcion,
      company: xmlCompany,
      cliente: xmlCliente,
      items: perceptionItems,
      totalPercibido, totalCobrado, moneda,
    };

    const xmlContent = this.xmlBuilder.buildPerception(perceptionData);
    const signedXml = this.xmlSigner.sign(xmlContent, cert.pfxBuffer, cert.passphrase);
    const xmlFileName = `${company.ruc}-${tipoDoc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;

    const { status, sunatCode, sunatMessage, sunatNotes, cdrZip, xmlHash } =
      await this.signAndSendSoap(signedXml, xmlFileName, ruc, solUser, solPass, company.isBeta, 'retention');

    const totalVenta = round2(perceptionItems.reduce((s, i) => s + i.importeTotal, 0));

    const invoice = await this.prisma.client.invoice.create({
      data: {
        companyId,
        tipoDoc,
        serie,
        correlativo,
        tipoOperacion: tipoDoc, // '40' for perception (no Cat 51 code applies)
        fechaEmision: new Date(dto.fechaEmision),
        clienteTipoDoc: dto.clienteTipoDoc,
        clienteNumDoc: dto.clienteNumDoc,
        clienteNombre: dto.clienteNombre,
        moneda,
        totalVenta,
        xmlContent: signedXml,
        xmlHash,
        xmlSigned: true,
        status,
        sunatCode,
        sunatMessage,
        sunatNotes: sunatNotes ?? undefined,
        cdrZip: cdrZip ? new Uint8Array(cdrZip) : undefined,
        sentAt: status !== 'PENDING' ? new Date() : undefined,
        attempts: status !== 'PENDING' ? 1 : 0,
        lastAttemptAt: new Date(),
      },
    });

    this.logger.log(`Perception created: ${serie}-${correlativo} status=${status}`);
    void this.billing.incrementInvoiceCount(companyId);
    return this.toResponseDto(invoice);
    } catch (error) {
      this.logger.warn(`Correlativo gap: ${serie}-${correlativo} was allocated but document creation failed`);
      throw error;
    }
  }

  /**
   * Create, sign, and send a Guía de Remisión (09) to SUNAT via REST API.
   *
   * Since RS 000112-2021/SUNAT, GRE uses a REST API with OAuth2 authentication.
   * The flow is asynchronous: sendGuide returns a ticket, then we poll for the CDR.
   * If the CDR is not immediately available, we queue a ticket-poll job.
   */
  async createGuide(
    companyId: string,
    dto: CreateGuideDto,
  ): Promise<InvoiceResponseDto> {
    this.xmlValidator.validateGuide(dto);

    const { company, cert, ruc, solUser, solPass, xmlCompany } =
      await this.prepareDocumentContext(companyId);

    const tipoDoc = TIPO_DOCUMENTO.GUIA_REMISION_REMITENTE;

    const serieGuia = company.serieGuiaRemision;
    const { serie, correlativo } = await this.getNextCorrelativo(
      companyId, tipoDoc, company, serieGuia,
    );

    // Build XML, sign, send (wrapped to log correlativo gap on failure)
    try {
    const xmlDestinatario: XmlClient = {
      tipoDocIdentidad: dto.destinatarioTipoDoc,
      numDocIdentidad: dto.destinatarioNumDoc,
      nombre: dto.destinatarioNombre,
    };

    const guideItems: XmlGuideItem[] = dto.items.map((item) => ({
      cantidad: item.cantidad,
      unidadMedida: item.unidadMedida ?? 'NIU',
      descripcion: item.descripcion,
      codigo: item.codigo,
    }));

    const guideData: XmlGuideData = {
      serie,
      correlativo,
      fechaEmision: dto.fechaEmision,
      fechaTraslado: dto.fechaTraslado,
      motivoTraslado: dto.motivoTraslado,
      descripcionMotivo: dto.descripcionMotivo,
      docReferencia: dto.docReferencia,
      modalidadTransporte: dto.modalidadTransporte,
      pesoTotal: dto.pesoTotal,
      unidadPeso: dto.unidadPeso ?? 'KGM',
      numeroBultos: dto.numeroBultos,
      puntoPartida: dto.puntoPartida,
      puntoLlegada: dto.puntoLlegada,
      company: xmlCompany,
      destinatario: xmlDestinatario,
      transportista: dto.transportista,
      conductor: dto.conductor,
      conductores: dto.conductores,
      vehiculo: dto.vehiculo,
      autorizacionEspecial: dto.autorizacionEspecial,
      items: guideItems,
    };

    const xmlContent = this.xmlBuilder.buildGuide(guideData);
    const signedXml = this.xmlSigner.sign(xmlContent, cert.pfxBuffer, cert.passphrase);
    const xmlHash = this.xmlSigner.getXmlHash(signedXml);

    const xmlFileName = `${company.ruc}-${tipoDoc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;
    const zipFileName = xmlFileName.replace('.xml', '.zip');
    const zipBuffer = await createZipFromXml(signedXml, xmlFileName);

    let status = 'SENDING';
    let sunatCode: string | undefined;
    let sunatMessage: string | undefined;
    let sunatNotes: string[] | undefined;
    let cdrZip: Buffer | undefined;
    let ticket: string | undefined;

    try {
      // Send via SUNAT GRE REST API (returns ticket, async processing)
      const sendResult = await this.sunatGreClient.sendGuide(
        zipBuffer, zipFileName, ruc, solUser, solPass,
        serie, correlativo, company.isBeta,
      );

      if (sendResult.success && sendResult.numTicket) {
        ticket = sendResult.numTicket;
        this.logger.log(`GRE sent, ticket=${ticket}. Polling for CDR...`);

        // Attempt to retrieve CDR immediately (best-effort, non-blocking)
        try {
          const statusResult = await this.sunatGreClient.getGuideStatus(
            ticket, ruc, solUser, solPass, company.isBeta,
          );

          if (statusResult.success && statusResult.cdrZip) {
            const cdr = this.cdrProcessor.processCdr(statusResult.cdrZip);
            sunatCode = cdr.responseCode;
            sunatMessage = cdr.description;
            sunatNotes = cdr.notes;
            cdrZip = statusResult.cdrZip;
            status = cdr.isAccepted ? (cdr.hasObservations ? 'OBSERVED' : 'ACCEPTED') : 'REJECTED';
          } else {
            // CDR not yet ready — queue for async polling
            status = 'QUEUED';
            sunatMessage = `Ticket: ${ticket}. CDR pending.`;
          }
        } catch (cdrError: unknown) {
          // Immediate CDR fetch failed, fall through to ticket polling
          const cdrMsg = cdrError instanceof Error ? cdrError.message : String(cdrError);
          this.logger.debug(`Immediate GRE CDR fetch failed, queuing poll: ${cdrMsg}`);
          status = 'QUEUED';
          sunatMessage = `Ticket: ${ticket}. CDR pending (immediate fetch failed).`;
        }
      } else {
        status = 'REJECTED';
        sunatMessage = sendResult.message;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SUNAT GRE send failed for ${serie}-${correlativo}: ${msg}`);
      status = 'PENDING';
      sunatMessage = msg;
    }

    const invoice = await this.prisma.client.invoice.create({
      data: {
        companyId,
        tipoDoc,
        serie,
        correlativo,
        tipoOperacion: tipoDoc, // '09' for guide (no Cat 51 code applies)
        fechaEmision: new Date(dto.fechaEmision),
        clienteTipoDoc: dto.destinatarioTipoDoc,
        clienteNumDoc: dto.destinatarioNumDoc,
        clienteNombre: dto.destinatarioNombre,
        moneda: 'PEN',
        totalVenta: 0, // Guide has no monetary totals
        xmlContent: signedXml,
        xmlHash,
        xmlSigned: true,
        status,
        sunatCode,
        sunatMessage,
        sunatNotes: sunatNotes ?? undefined,
        cdrZip: cdrZip ? new Uint8Array(cdrZip) : undefined,
        sentAt: cdrZip ? new Date() : undefined,
        attempts: 1,
        lastAttemptAt: new Date(),
      },
    });

    // If CDR not yet available, queue a ticket-poll job
    if (status === 'QUEUED' && ticket) {
      await this.ticketPollQueue.add('poll-gre-cdr', {
        invoiceId: invoice.id,
        companyId,
        ticket,
        ruc,
        solUser,
        solPass,
        isBeta: company.isBeta,
        documentType: 'guide',
      } satisfies import('../queues/interfaces/index.js').TicketPollJobData);
    }

    this.logger.log(`Guide created: ${serie}-${correlativo} status=${status}`);
    void this.billing.incrementInvoiceCount(companyId);
    return this.toResponseDto(invoice);
    } catch (error) {
      this.logger.warn(`Correlativo gap: ${serie}-${correlativo} was allocated but document creation failed`);
      throw error;
    }
  }

  /**
   * Resend a failed/rejected invoice to SUNAT.
   * Only allowed for REJECTED or DRAFT status.
   *
   * Supported document types: 01, 03, 07, 08, 20, 40 (synchronous sendBill).
   * RC/RA (async summaries) and 09 (GRE REST API) cannot be resent — they
   * must be re-created since their send flow is fundamentally different.
   */
  async resend(
    companyId: string,
    invoiceId: string,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, companyId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Duplicate protection: prevent re-queuing if already in progress
    if (invoice.status === 'QUEUED' || invoice.status === 'SENDING') {
      throw new BadRequestException(
        'El documento ya está en cola de envío. Espere a que se complete la operación.',
      );
    }

    // RC/RA use sendSummary (async with ticket), GRE uses REST API.
    // These cannot be resent via the standard sendBill queue.
    const nonResendableTypes = ['RC', 'RA', '09'];
    if (nonResendableTypes.includes(invoice.tipoDoc)) {
      throw new BadRequestException(
        `Cannot resend document type "${invoice.tipoDoc}". Resúmenes Diarios (RC), Comunicaciones de Baja (RA), and Guías de Remisión (09) must be re-created instead.`,
      );
    }

    if (invoice.status !== 'REJECTED' && invoice.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot resend invoice with status "${invoice.status}". Only REJECTED or DRAFT invoices can be resent.`,
      );
    }

    if (!invoice.xmlContent || !invoice.xmlSigned) {
      throw new BadRequestException(
        'Cannot resend invoice without signed XML content. The document must be re-created.',
      );
    }

    // Reset status and queue for re-send
    const updated = await this.prisma.client.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'QUEUED',
        lastError: null,
      },
    });

    await this.invoiceSendQueue.add(
      'resend',
      { invoiceId, companyId },
      { jobId: `resend-${invoiceId}-${Date.now()}` },
    );

    this.logger.log(
      `Invoice ${invoice.serie}-${invoice.correlativo} queued for resend (attempt=${invoice.attempts + 1})`,
    );

    return this.toResponseDto(updated);
  }

  /**
   * Consult CDR from SUNAT for a previously sent document.
   * Re-downloads the CDR or verifies the document status.
   */
  async consultCdr(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, companyId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    const { company, ruc, solUser, solPass } =
      await this.prepareDocumentContext(companyId, true);

    const result = await this.sunatClient.consultCdr(
      ruc, invoice.tipoDoc, invoice.serie, invoice.correlativo,
      solUser, solPass, company.isBeta,
    );

    // Update invoice if CDR was retrieved
    if (result.success && result.cdrZip) {
      const cdr = this.cdrProcessor.processCdr(result.cdrZip);
      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: {
          sunatCode: cdr.responseCode,
          sunatMessage: cdr.description,
          sunatNotes: cdr.notes ?? undefined,
          cdrZip: new Uint8Array(result.cdrZip),
          status: cdr.isAccepted ? (cdr.hasObservations ? 'OBSERVED' : 'ACCEPTED') : 'REJECTED',
        },
      });
    }

    return {
      success: result.success,
      code: result.code,
      message: result.message,
      hasCdr: !!result.cdrZip,
    };
  }

  /**
   * Annul a Guía de Remisión (09) via SUNAT GRE REST API.
   */
  async anularGuia(companyId: string, invoiceId: string, motivo: string) {
    const invoice = await this.prisma.client.invoice.findFirst({
      where: { id: invoiceId, companyId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.tipoDoc !== TIPO_DOCUMENTO.GUIA_REMISION_REMITENTE) {
      throw new BadRequestException('Only Guías de Remisión (09) can be annulled via this endpoint');
    }

    const { company, ruc, solUser, solPass } =
      await this.prepareDocumentContext(companyId, true);

    const result = await this.sunatGreClient.anularGuia(
      ruc, invoice.serie, invoice.correlativo,
      motivo, solUser, solPass, company.isBeta,
    );

    if (result.success) {
      await this.prisma.client.invoice.update({
        where: { id: invoiceId },
        data: { status: 'REJECTED', sunatMessage: `Anulada: ${motivo}` },
      });
    }

    return {
      success: result.success,
      message: result.message,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Get next correlativo for a given series, atomically incrementing the counter.
   *
   * Uses a single atomic SQL UPDATE with jsonb_set + COALESCE to prevent
   * race conditions when multiple requests hit the same series concurrently.
   * The increment happens entirely within PostgreSQL, so no read-then-write gap.
   */
  private async getNextCorrelativo(
    companyId: string,
    tipoDoc: string,
    company: CompanyModel,
    serieOverride?: string,
  ): Promise<{ serie: string; correlativo: number }> {
    let serie: string;
    if (serieOverride) {
      serie = serieOverride;
    } else if (tipoDoc === TIPO_DOCUMENTO.FACTURA) {
      serie = company.serieFactura;
    } else if (tipoDoc === TIPO_DOCUMENTO.BOLETA) {
      serie = company.serieBoleta;
    } else {
      serie = 'F001';
    }

    const correlativo = await this.atomicIncrementCorrelativo(companyId, serie);
    return { serie, correlativo };
  }

  /**
   * Atomically increment a correlativo counter in the company's next_correlativo JSON.
   *
   * Single SQL statement: no read-then-write race condition possible.
   * Uses PostgreSQL jsonb_set + COALESCE to handle missing keys safely.
   */
  private async atomicIncrementCorrelativo(
    companyId: string,
    serieKey: string,
  ): Promise<number> {
    const result: Array<{ next_correlativo: Record<string, number> }> =
      await this.prisma.client.$queryRawUnsafe(
        `UPDATE companies
         SET next_correlativo = jsonb_set(
           COALESCE(next_correlativo, '{}'::jsonb),
           $2::text[],
           to_jsonb(COALESCE((next_correlativo->>$3)::int, 0) + 1)
         ),
         updated_at = NOW()
         WHERE id = $1
         RETURNING next_correlativo`,
        companyId,
        `{${serieKey}}`,
        serieKey,
      );

    if (!result[0]) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    const correlativo = result[0].next_correlativo[serieKey]!;

    if (correlativo > 99999999) {
      throw new BadRequestException(
        `Correlativo limit (99999999) exceeded for serie ${serieKey}. Contact support.`,
      );
    }

    return correlativo;
  }

  /**
   * Common preparation for all document types: load company, cert, SOL creds,
   * resolve beta credentials. Reduces duplication across create methods.
   */
  private async prepareDocumentContext(companyId: string, skipQuota = false) {
    if (!skipQuota) await this.enforceQuota(companyId);

    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    const cert = await this.certificates.getActiveCertificate(companyId);
    const solCreds = await this.companies.getSolCredentials(companyId);

    const ruc = company.isBeta ? '20000000001' : company.ruc;
    const solUser = company.isBeta ? 'MODDATOS' : (solCreds?.solUser ?? '');
    const solPass = company.isBeta ? 'moddatos' : (solCreds?.solPass ?? '');

    if (!company.isBeta && (!solUser || !solPass)) {
      throw new BadRequestException('SOL credentials required for production');
    }

    return { company, cert, ruc, solUser, solPass, xmlCompany: this.buildXmlCompany(company) };
  }

  /**
   * Common: sign XML, create ZIP, and send to SUNAT via SOAP.
   * Returns the CDR processing result or error status.
   */
  private async signAndSendSoap(
    signedXml: string,
    xmlFileName: string,
    ruc: string,
    solUser: string,
    solPass: string,
    isBeta: boolean,
    endpointType: 'invoice' | 'retention' = 'invoice',
  ) {
    const zipFileName = xmlFileName.replace('.xml', '.zip');
    const zipBuffer = await createZipFromXml(signedXml, xmlFileName);
    const xmlHash = this.xmlSigner.getXmlHash(signedXml);

    let status = 'SENDING';
    let sunatCode: string | undefined;
    let sunatMessage: string | undefined;
    let sunatNotes: string[] | undefined;
    let cdrZip: Buffer | undefined;

    try {
      const result = await this.sunatClient.sendBill(
        zipBuffer, zipFileName, ruc, solUser, solPass, isBeta, endpointType,
      );

      if (result.success && result.cdrZip) {
        const cdr = this.cdrProcessor.processCdr(result.cdrZip);
        sunatCode = cdr.responseCode;
        sunatMessage = cdr.description;
        sunatNotes = cdr.notes;
        cdrZip = result.cdrZip;
        status = cdr.isAccepted ? (cdr.hasObservations ? 'OBSERVED' : 'ACCEPTED') : 'REJECTED';
      } else {
        status = 'REJECTED';
        sunatCode = result.rawFaultCode ?? result.code;
        sunatMessage = result.rawFaultString ?? result.message;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`SUNAT send failed: ${msg}`);
      status = 'PENDING';
      sunatMessage = msg;
    }

    return { status, sunatCode, sunatMessage, sunatNotes, cdrZip, xmlHash, zipBuffer, zipFileName };
  }

  private buildXmlCompany(company: CompanyModel): XmlCompany {
    return {
      ruc: company.ruc,
      razonSocial: company.razonSocial,
      nombreComercial: company.nombreComercial ?? undefined,
      direccion: company.direccion,
      ubigeo: company.ubigeo,
      departamento: company.departamento,
      provincia: company.provincia,
      distrito: company.distrito,
      urbanizacion: company.urbanizacion ?? undefined,
      codigoPais: company.codigoPais,
    };
  }

  private async enforceQuota(companyId: string): Promise<void> {
    const quota = await this.billing.checkQuota(companyId);
    if (!quota.allowed) {
      throw new BadRequestException(
        `Invoice quota exceeded: ${quota.used}/${quota.max} used this period. Upgrade your plan to continue.`,
      );
    }
  }

  private toResponseDto(invoice: InvoiceModel): InvoiceResponseDto {
    return {
      id: invoice.id,
      tipoDoc: invoice.tipoDoc,
      serie: invoice.serie,
      correlativo: invoice.correlativo,
      fechaEmision:
        invoice.fechaEmision instanceof Date
          ? invoice.fechaEmision.toISOString().split('T')[0]
          : invoice.fechaEmision,
      clienteNombre: invoice.clienteNombre,
      clienteNumDoc: invoice.clienteNumDoc,
      moneda: invoice.moneda,
      totalVenta: Number(invoice.totalVenta),
      status: invoice.status,
      sunatCode: invoice.sunatCode ?? undefined,
      sunatMessage: invoice.sunatMessage ?? undefined,
      xmlHash: invoice.xmlHash ?? undefined,
      createdAt: invoice.createdAt.toISOString(),
    };
  }
}
