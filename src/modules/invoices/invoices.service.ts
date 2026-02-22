import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { XmlBuilderService } from '../xml-builder/xml-builder.service.js';
import { XmlSignerService } from '../xml-signer/xml-signer.service.js';
import { SunatClientService } from '../sunat-client/sunat-client.service.js';
import { CdrProcessorService } from '../cdr-processor/cdr-processor.service.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { CompaniesService } from '../companies/companies.service.js';
import { XmlValidatorService } from '../xml-builder/validators/xml-validator.js';
import { createZipFromXml } from '../../common/utils/zip.js';
import {
  calculateItemTaxes,
  calculateInvoiceTotals,
  round2,
} from '../../common/utils/tax-calculator.js';
import { amountToWords } from '../../common/utils/amount-to-words.js';
import { TIPO_DOCUMENTO } from '../../common/constants/index.js';
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
} from '../xml-builder/interfaces/xml-builder.interfaces.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import type { CreateDebitNoteDto } from './dto/create-debit-note.dto.js';
import type { CreateSummaryDto } from './dto/create-summary.dto.js';
import type { CreateVoidedDto } from './dto/create-voided.dto.js';
import type { InvoiceResponseDto } from './dto/invoice-response.dto.js';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly xmlBuilder: XmlBuilderService,
    private readonly xmlSigner: XmlSignerService,
    private readonly sunatClient: SunatClientService,
    private readonly cdrProcessor: CdrProcessorService,
    private readonly certificates: CertificatesService,
    private readonly companies: CompaniesService,
    private readonly xmlValidator: XmlValidatorService,
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

    // 1. Load company data
    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // 2. Get certificate
    const cert = await this.certificates.getActiveCertificate(companyId);

    // 3. Get SOL credentials
    const solCreds = await this.companies.getSolCredentials(companyId);

    // 4. Calculate taxes for each item
    const tipoDoc = dto.tipoDoc;
    const moneda = dto.moneda ?? 'PEN';
    const tipoOperacion = dto.tipoOperacion ?? '0101';
    const formaPago = dto.formaPago ?? 'Contado';

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

    // 7. Build XML invoice items
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
    const xmlCompany: XmlCompany = {
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

    const xmlClient: XmlClient = {
      tipoDocIdentidad: dto.clienteTipoDoc,
      numDocIdentidad: dto.clienteNumDoc,
      nombre: dto.clienteNombre,
      direccion: dto.clienteDireccion,
    };

    const invoiceData: XmlInvoiceData = {
      tipoDoc,
      serie,
      correlativo,
      tipoOperacion,
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
        formaPago: formaPago as 'Contado' | 'Credito',
        cuotas: dto.cuotas?.map((c) => ({
          monto: c.monto,
          moneda: c.moneda ?? moneda,
          fechaPago: c.fechaPago,
        })),
      },
      montoEnLetras: amountToWords(totals.totalVenta, moneda),
    };

    const xmlContent = this.xmlBuilder.buildInvoice(invoiceData);

    // 9. Sign XML
    const signedXml = this.xmlSigner.sign(
      xmlContent,
      cert.pfxBuffer,
      cert.passphrase,
    );
    const xmlHash = this.xmlSigner.getXmlHash(signedXml);

    // 10. Create ZIP
    const xmlFileName = `${company.ruc}-${tipoDoc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;
    const zipFileName = xmlFileName.replace('.xml', '.zip');
    const zipBuffer = await createZipFromXml(signedXml, xmlFileName);

    // 11. Determine SUNAT credentials
    const ruc = company.isBeta ? '20000000001' : company.ruc;
    const solUser = company.isBeta ? 'MODDATOS' : (solCreds?.solUser ?? '');
    const solPass = company.isBeta ? 'moddatos' : (solCreds?.solPass ?? '');

    if (!company.isBeta && (!solUser || !solPass)) {
      throw new BadRequestException(
        'SOL credentials are required for production. Configure them first.',
      );
    }

    // 12. Send to SUNAT
    let status = 'SENDING';
    let sunatCode: string | undefined;
    let sunatMessage: string | undefined;
    let sunatNotes: string[] | undefined;
    let cdrZip: Buffer | undefined;

    try {
      const result = await this.sunatClient.sendBill(
        zipBuffer,
        zipFileName,
        ruc,
        solUser,
        solPass,
        company.isBeta,
      );

      if (result.success && result.cdrZip) {
        // 13. Process CDR
        const cdr = this.cdrProcessor.processCdr(result.cdrZip);
        sunatCode = cdr.responseCode;
        sunatMessage = cdr.description;
        sunatNotes = cdr.notes;
        cdrZip = result.cdrZip;

        if (cdr.isAccepted) {
          status = cdr.hasObservations ? 'OBSERVED' : 'ACCEPTED';
        } else {
          status = 'REJECTED';
        }
      } else {
        status = 'REJECTED';
        sunatCode = result.rawFaultCode ?? result.code;
        sunatMessage = result.rawFaultString ?? result.message;
      }
    } catch (error: any) {
      this.logger.error(
        `SUNAT send failed for ${serie}-${correlativo}: ${error.message}`,
      );
      status = 'PENDING'; // Will be retried
      sunatMessage = error.message;
    }

    // 14. Save to database
    const invoice = await this.prisma.client.invoice.create({
      data: {
        companyId,
        tipoDoc,
        serie,
        correlativo,
        tipoOperacion,
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
        cuotas: dto.cuotas ?? undefined,
        xmlContent: signedXml,
        xmlHash,
        xmlSigned: true,
        status,
        sunatCode,
        sunatMessage,
        sunatNotes: sunatNotes ?? undefined,
        cdrZip: cdrZip ?? undefined,
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

    return this.toResponseDto(invoice);
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

    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    const cert = await this.certificates.getActiveCertificate(companyId);
    const solCreds = await this.companies.getSolCredentials(companyId);
    const moneda = dto.moneda ?? 'PEN';
    const tipoDoc = TIPO_DOCUMENTO.NOTA_CREDITO;

    // Determine serie based on referenced document type
    const serieKey =
      dto.docRefTipo === '01' ? 'serieNCFactura' : 'serieNCBoleta';
    const { serie, correlativo } = await this.getNextCorrelativo(
      companyId,
      tipoDoc,
      company,
      (company as any)[serieKey] as string,
    );

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

    const xmlCompany = this.buildXmlCompany(company);
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
    const xmlHash = this.xmlSigner.getXmlHash(signedXml);

    const xmlFileName = `${company.ruc}-${tipoDoc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;
    const zipFileName = xmlFileName.replace('.xml', '.zip');
    const zipBuffer = await createZipFromXml(signedXml, xmlFileName);

    const ruc = company.isBeta ? '20000000001' : company.ruc;
    const solUser = company.isBeta ? 'MODDATOS' : (solCreds?.solUser ?? '');
    const solPass = company.isBeta ? 'moddatos' : (solCreds?.solPass ?? '');

    let status = 'SENDING';
    let sunatCode: string | undefined;
    let sunatMessage: string | undefined;
    let sunatNotes: string[] | undefined;
    let cdrZip: Buffer | undefined;

    try {
      const result = await this.sunatClient.sendBill(
        zipBuffer, zipFileName, ruc, solUser, solPass, company.isBeta,
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
    } catch (error: any) {
      this.logger.error(`SUNAT send failed for NC ${serie}-${correlativo}: ${error.message}`);
      status = 'PENDING';
      sunatMessage = error.message;
    }

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
        cdrZip: cdrZip ?? undefined,
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
    return this.toResponseDto(invoice);
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

    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    const cert = await this.certificates.getActiveCertificate(companyId);
    const solCreds = await this.companies.getSolCredentials(companyId);
    const moneda = dto.moneda ?? 'PEN';
    const tipoDoc = TIPO_DOCUMENTO.NOTA_DEBITO;

    const serieKey =
      dto.docRefTipo === '01' ? 'serieNDFactura' : 'serieNDBoleta';
    const { serie, correlativo } = await this.getNextCorrelativo(
      companyId,
      tipoDoc,
      company,
      (company as any)[serieKey] as string,
    );

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

    const xmlCompany = this.buildXmlCompany(company);
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
    const xmlHash = this.xmlSigner.getXmlHash(signedXml);

    const xmlFileName = `${company.ruc}-${tipoDoc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;
    const zipFileName = xmlFileName.replace('.xml', '.zip');
    const zipBuffer = await createZipFromXml(signedXml, xmlFileName);

    const ruc = company.isBeta ? '20000000001' : company.ruc;
    const solUser = company.isBeta ? 'MODDATOS' : (solCreds?.solUser ?? '');
    const solPass = company.isBeta ? 'moddatos' : (solCreds?.solPass ?? '');

    let status = 'SENDING';
    let sunatCode: string | undefined;
    let sunatMessage: string | undefined;
    let sunatNotes: string[] | undefined;
    let cdrZip: Buffer | undefined;

    try {
      const result = await this.sunatClient.sendBill(
        zipBuffer, zipFileName, ruc, solUser, solPass, company.isBeta,
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
    } catch (error: any) {
      this.logger.error(`SUNAT send failed for ND ${serie}-${correlativo}: ${error.message}`);
      status = 'PENDING';
      sunatMessage = error.message;
    }

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
        cdrZip: cdrZip ?? undefined,
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
    return this.toResponseDto(invoice);
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

    const where: any = { companyId };
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
      data: invoices.map((inv: any) => ({
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
   * Create, sign, and send a Resumen Diario (RC) to SUNAT.
   *
   * Summary documents are sent asynchronously — SUNAT returns a ticket
   * that must be polled via getStatus to retrieve the CDR.
   */
  async createSummary(
    companyId: string,
    dto: CreateSummaryDto,
  ): Promise<{ ticket?: string; id: string; status: string; sunatMessage?: string }> {
    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    const cert = await this.certificates.getActiveCertificate(companyId);
    const solCreds = await this.companies.getSolCredentials(companyId);
    const fechaEmision = dto.fechaEmision ?? new Date().toISOString().split('T')[0]!;
    const moneda = dto.moneda ?? 'PEN';

    // Get next correlativo for RC
    const dateStr = fechaEmision.replace(/-/g, '');
    const rcSerieKey = `RC-${dateStr}`;
    const nextCorrelativo = (company.nextCorrelativo as Record<string, number>) ?? {};
    const correlativo = (nextCorrelativo[rcSerieKey] ?? 0) + 1;
    nextCorrelativo[rcSerieKey] = correlativo;
    await this.prisma.client.company.update({
      where: { id: companyId },
      data: { nextCorrelativo },
    });

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

    const xmlCompany = this.buildXmlCompany(company);

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

    // SUNAT credentials
    const ruc = company.isBeta ? '20000000001' : company.ruc;
    const solUser = company.isBeta ? 'MODDATOS' : (solCreds?.solUser ?? '');
    const solPass = company.isBeta ? 'moddatos' : (solCreds?.solPass ?? '');

    if (!company.isBeta && (!solUser || !solPass)) {
      throw new BadRequestException('SOL credentials required for production');
    }

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
    } catch (error: any) {
      this.logger.error(`SUNAT sendSummary failed for ${summaryId}: ${error.message}`);
      status = 'PENDING';
      sunatMessage = error.message;
    }

    this.logger.log(`Summary created: ${summaryId} status=${status} ticket=${ticket ?? 'N/A'}`);

    return { ticket, id: summaryId, status, sunatMessage };
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
  ): Promise<{ ticket?: string; id: string; status: string; sunatMessage?: string }> {
    const company = await this.prisma.client.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    const cert = await this.certificates.getActiveCertificate(companyId);
    const solCreds = await this.companies.getSolCredentials(companyId);
    const fechaEmision = dto.fechaEmision ?? new Date().toISOString().split('T')[0]!;

    // Get next correlativo for RA
    const dateStr = fechaEmision.replace(/-/g, '');
    const raSerieKey = `RA-${dateStr}`;
    const nextCorrelativo = (company.nextCorrelativo as Record<string, number>) ?? {};
    const correlativo = (nextCorrelativo[raSerieKey] ?? 0) + 1;
    nextCorrelativo[raSerieKey] = correlativo;
    await this.prisma.client.company.update({
      where: { id: companyId },
      data: { nextCorrelativo },
    });

    // Build voided lines
    const voidedLines: XmlVoidedLine[] = dto.items.map((item) => ({
      tipoDoc: item.tipoDoc,
      serie: item.serie,
      correlativo: item.correlativo,
      motivo: item.motivo,
    }));

    const xmlCompany = this.buildXmlCompany(company);

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

    // SUNAT credentials
    const ruc = company.isBeta ? '20000000001' : company.ruc;
    const solUser = company.isBeta ? 'MODDATOS' : (solCreds?.solUser ?? '');
    const solPass = company.isBeta ? 'moddatos' : (solCreds?.solPass ?? '');

    if (!company.isBeta && (!solUser || !solPass)) {
      throw new BadRequestException('SOL credentials required for production');
    }

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
    } catch (error: any) {
      this.logger.error(`SUNAT sendSummary failed for ${voidedId}: ${error.message}`);
      status = 'PENDING';
      sunatMessage = error.message;
    }

    this.logger.log(`Voided created: ${voidedId} status=${status} ticket=${ticket ?? 'N/A'}`);

    return { ticket, id: voidedId, status, sunatMessage };
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Get next correlativo for a given series, atomically incrementing the counter.
   */
  private async getNextCorrelativo(
    companyId: string,
    tipoDoc: string,
    company: any,
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

    const nextCorrelativo = (company.nextCorrelativo as Record<string, number>) ?? {};
    const correlativo = (nextCorrelativo[serie] ?? 0) + 1;

    // Update atomically
    nextCorrelativo[serie] = correlativo;
    await this.prisma.client.company.update({
      where: { id: companyId },
      data: { nextCorrelativo },
    });

    return { serie, correlativo };
  }

  private buildXmlCompany(company: any): XmlCompany {
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

  private toResponseDto(invoice: any): InvoiceResponseDto {
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
