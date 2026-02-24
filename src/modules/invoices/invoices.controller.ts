import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Res,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { InvoicesService } from './invoices.service.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto.js';
import { CreateSummaryDto } from './dto/create-summary.dto.js';
import { CreateVoidedDto } from './dto/create-voided.dto.js';
import { CreateRetentionDto } from './dto/create-retention.dto.js';
import { CreatePerceptionDto } from './dto/create-perception.dto.js';
import { CreateGuideDto } from './dto/create-guide.dto.js';
import { Tenant } from '../../common/decorators/tenant.decorator.js';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  private readonly logger = new Logger(InvoicesController.name);

  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('factura')
  @ApiOperation({ summary: 'Create a Factura (01) electronic invoice' })
  @ApiResponse({ status: 201, description: 'Factura created and queued for SUNAT' })
  @ApiResponse({ status: 400, description: 'Validation error in invoice data' })
  async createFactura(
    @Tenant() companyId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    const result = await this.invoicesService.createInvoice(companyId, { ...dto, tipoDoc: '01' });
    return { success: true, data: result };
  }

  @Post('boleta')
  @ApiOperation({ summary: 'Create a Boleta de Venta (03) electronic receipt' })
  @ApiResponse({ status: 201, description: 'Boleta created and queued for SUNAT' })
  @ApiResponse({ status: 400, description: 'Validation error in boleta data' })
  async createBoleta(
    @Tenant() companyId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    const result = await this.invoicesService.createInvoice(companyId, { ...dto, tipoDoc: '03' });
    return { success: true, data: result };
  }

  @Post('nota-credito')
  @ApiOperation({ summary: 'Create a Nota de Crédito (07)' })
  @ApiResponse({ status: 201, description: 'Credit note created and queued for SUNAT' })
  @ApiResponse({ status: 400, description: 'Validation error in credit note data' })
  async createNotaCredito(
    @Tenant() companyId: string,
    @Body() dto: CreateCreditNoteDto,
  ) {
    const result = await this.invoicesService.createCreditNote(companyId, dto);
    return { success: true, data: result };
  }

  @Post('nota-debito')
  @ApiOperation({ summary: 'Create a Nota de Débito (08)' })
  @ApiResponse({ status: 201, description: 'Debit note created and queued for SUNAT' })
  @ApiResponse({ status: 400, description: 'Validation error in debit note data' })
  async createNotaDebito(
    @Tenant() companyId: string,
    @Body() dto: CreateDebitNoteDto,
  ) {
    const result = await this.invoicesService.createDebitNote(companyId, dto);
    return { success: true, data: result };
  }

  @Post('resumen-diario')
  @ApiOperation({ summary: 'Create a Resumen Diario (RC) for boletas' })
  @ApiResponse({ status: 201, description: 'Summary created and queued for SUNAT' })
  @ApiResponse({ status: 400, description: 'Validation error in summary data' })
  async createResumenDiario(
    @Tenant() companyId: string,
    @Body() dto: CreateSummaryDto,
  ) {
    const result = await this.invoicesService.createSummary(companyId, dto);
    return { success: true, data: result };
  }

  @Post('comunicacion-baja')
  @ApiOperation({ summary: 'Create a Comunicación de Baja (RA) to void documents' })
  @ApiResponse({ status: 201, description: 'Voided document created and queued for SUNAT' })
  @ApiResponse({ status: 400, description: 'Validation error in voided document data' })
  async createComunicacionBaja(
    @Tenant() companyId: string,
    @Body() dto: CreateVoidedDto,
  ) {
    const result = await this.invoicesService.createVoided(companyId, dto);
    return { success: true, data: result };
  }

  @Post('retencion')
  @ApiOperation({ summary: 'Create a Comprobante de Retención (20)' })
  @ApiResponse({ status: 201, description: 'Retention document created and sent to SUNAT' })
  @ApiResponse({ status: 400, description: 'Validation error in retention data' })
  async createRetencion(
    @Tenant() companyId: string,
    @Body() dto: CreateRetentionDto,
  ) {
    const result = await this.invoicesService.createRetention(companyId, dto);
    return { success: true, data: result };
  }

  @Post('percepcion')
  @ApiOperation({ summary: 'Create a Comprobante de Percepción (40)' })
  @ApiResponse({ status: 201, description: 'Perception document created and sent to SUNAT' })
  @ApiResponse({ status: 400, description: 'Validation error in perception data' })
  async createPercepcion(
    @Tenant() companyId: string,
    @Body() dto: CreatePerceptionDto,
  ) {
    const result = await this.invoicesService.createPerception(companyId, dto);
    return { success: true, data: result };
  }

  @Post('guia-remision')
  @ApiOperation({ summary: 'Create a Guía de Remisión Electrónica (09)' })
  @ApiResponse({ status: 201, description: 'Despatch advice created and sent to SUNAT' })
  @ApiResponse({ status: 400, description: 'Validation error in guide data' })
  async createGuiaRemision(
    @Tenant() companyId: string,
    @Body() dto: CreateGuideDto,
  ) {
    const result = await this.invoicesService.createGuide(companyId, dto);
    return { success: true, data: result };
  }

  @Get()
  @ApiOperation({ summary: 'List invoices with filters and pagination' })
  @ApiQuery({ name: 'tipoDoc', required: false, description: 'Document type: 01, 03, 07, 08, 09, 20, 40, RC, RA' })
  @ApiQuery({ name: 'status', required: false, description: 'Status: DRAFT, PENDING, ACCEPTED, REJECTED' })
  @ApiQuery({ name: 'desde', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'hasta', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'clienteNumDoc', required: false, description: 'Client document number' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default 20)' })
  @ApiResponse({ status: 200, description: 'Paginated list of invoices' })
  async list(
    @Tenant() companyId: string,
    @Query('tipoDoc') tipoDoc?: string,
    @Query('status') status?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('clienteNumDoc') clienteNumDoc?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.invoicesService.findAll(companyId, {
      tipoDoc,
      status,
      desde,
      hasta,
      clienteNumDoc,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice details by ID' })
  @ApiResponse({ status: 200, description: 'Invoice details with items and SUNAT status' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async findOne(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    const result = await this.invoicesService.findById(companyId, id);
    return { success: true, data: result };
  }

  @Get(':id/xml')
  @ApiOperation({ summary: 'Download signed XML of an invoice' })
  @ApiResponse({ status: 200, description: 'XML file download' })
  @ApiResponse({ status: 404, description: 'Invoice or XML not found' })
  async getXml(
    @Tenant() companyId: string,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const xml = await this.invoicesService.getXml(companyId, id);
    reply
      .header('Content-Type', 'application/xml')
      .header('Content-Disposition', `attachment; filename="invoice-${id}.xml"`)
      .send(xml);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Download PDF representation of an invoice' })
  @ApiQuery({ name: 'format', required: false, description: 'PDF format: a4 (default) or ticket' })
  @ApiResponse({ status: 200, description: 'PDF file download' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async getPdf(
    @Tenant() companyId: string,
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const pdfFormat = format === 'ticket' ? 'ticket' as const : 'a4' as const;
    const { buffer, filename } = await this.invoicesService.getPdf(companyId, id, pdfFormat);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  }

  @Get(':id/cdr')
  @ApiOperation({ summary: 'Download CDR (SUNAT response) ZIP file' })
  @ApiResponse({ status: 200, description: 'CDR ZIP file download' })
  @ApiResponse({ status: 404, description: 'Invoice or CDR not found' })
  async getCdr(
    @Tenant() companyId: string,
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ) {
    const cdrBuffer = await this.invoicesService.getCdr(companyId, id);
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="cdr-${id}.zip"`)
      .send(cdrBuffer);
  }

  @Post(':id/resend')
  @ApiOperation({ summary: 'Resend an invoice to SUNAT' })
  @ApiResponse({ status: 201, description: 'Invoice re-queued for SUNAT submission' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiResponse({ status: 409, description: 'Invoice already accepted by SUNAT' })
  async resend(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    const result = await this.invoicesService.resend(companyId, id);
    return { success: true, data: result };
  }

  @Get(':id/consult-cdr')
  @ApiOperation({ summary: 'Consult CDR from SUNAT for a document (production only)' })
  @ApiResponse({ status: 200, description: 'CDR consultation result' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async consultCdr(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    const result = await this.invoicesService.consultCdr(companyId, id);
    return { success: true, data: result };
  }

  @Post(':id/anular-guia')
  @ApiOperation({ summary: 'Annul a Guía de Remisión (09) via SUNAT GRE API' })
  @ApiResponse({ status: 200, description: 'Guide annulment result' })
  @ApiResponse({ status: 400, description: 'Document is not a GRE or cannot be annulled' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  async anularGuia(
    @Tenant() companyId: string,
    @Param('id') id: string,
    @Body('motivo') motivo: string,
  ) {
    const result = await this.invoicesService.anularGuia(companyId, id, motivo);
    return { success: true, data: result };
  }
}
