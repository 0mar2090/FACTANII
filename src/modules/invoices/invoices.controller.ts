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
import type { FastifyReply } from 'fastify';
import { InvoicesService } from './invoices.service.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto.js';
import { CreateSummaryDto } from './dto/create-summary.dto.js';
import { CreateVoidedDto } from './dto/create-voided.dto.js';
import { Tenant } from '../../common/decorators/tenant.decorator.js';

@Controller('invoices')
export class InvoicesController {
  private readonly logger = new Logger(InvoicesController.name);

  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('factura')
  async createFactura(
    @Tenant() companyId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    // Force tipoDoc to "01" for factura endpoint
    dto.tipoDoc = '01';
    const result = await this.invoicesService.createInvoice(companyId, dto);
    return { success: true, data: result };
  }

  @Post('boleta')
  async createBoleta(
    @Tenant() companyId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    // Force tipoDoc to "03" for boleta endpoint
    dto.tipoDoc = '03';
    const result = await this.invoicesService.createInvoice(companyId, dto);
    return { success: true, data: result };
  }

  @Post('nota-credito')
  async createNotaCredito(
    @Tenant() companyId: string,
    @Body() dto: CreateCreditNoteDto,
  ) {
    const result = await this.invoicesService.createCreditNote(companyId, dto);
    return { success: true, data: result };
  }

  @Post('nota-debito')
  async createNotaDebito(
    @Tenant() companyId: string,
    @Body() dto: CreateDebitNoteDto,
  ) {
    const result = await this.invoicesService.createDebitNote(companyId, dto);
    return { success: true, data: result };
  }

  @Post('resumen-diario')
  async createResumenDiario(
    @Tenant() companyId: string,
    @Body() dto: CreateSummaryDto,
  ) {
    const result = await this.invoicesService.createSummary(companyId, dto);
    return { success: true, data: result };
  }

  @Post('comunicacion-baja')
  async createComunicacionBaja(
    @Tenant() companyId: string,
    @Body() dto: CreateVoidedDto,
  ) {
    const result = await this.invoicesService.createVoided(companyId, dto);
    return { success: true, data: result };
  }

  @Get()
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
  async findOne(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    const result = await this.invoicesService.findById(companyId, id);
    return { success: true, data: result };
  }

  @Get(':id/xml')
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
  async resend(
    @Tenant() companyId: string,
    @Param('id') id: string,
  ) {
    const result = await this.invoicesService.resend(companyId, id);
    return { success: true, data: result };
  }
}
