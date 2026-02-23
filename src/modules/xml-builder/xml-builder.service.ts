// ═══════════════════════════════════════════════════════════════════
// XML Builder Service — Orchestrator for UBL 2.1 XML generation
// ═══════════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { InvoiceBuilder } from './builders/invoice.builder.js';
import { CreditNoteBuilder } from './builders/credit-note.builder.js';
import { DebitNoteBuilder } from './builders/debit-note.builder.js';
import { SummaryBuilder } from './builders/summary.builder.js';
import { VoidedBuilder } from './builders/voided.builder.js';
import { RetentionBuilder } from './builders/retention.builder.js';
import { PerceptionBuilder } from './builders/perception.builder.js';
import { GuideBuilder } from './builders/guide.builder.js';
import type {
  XmlInvoiceData,
  XmlCreditNoteData,
  XmlDebitNoteData,
  XmlSummaryData,
  XmlVoidedData,
  XmlRetentionData,
  XmlPerceptionData,
  XmlGuideData,
} from './interfaces/xml-builder.interfaces.js';

/**
 * Orchestrator service for building SUNAT UBL 2.1 XML documents.
 *
 * This service delegates to specialized builder classes for each
 * document type. Each builder is stateless and creates a fresh
 * XML document on every call.
 *
 * Usage:
 * ```typescript
 * const xml = xmlBuilderService.buildInvoice(invoiceData);
 * const xml = xmlBuilderService.buildCreditNote(creditNoteData);
 * const xml = xmlBuilderService.buildDebitNote(debitNoteData);
 * ```
 *
 * The returned XML string is unsigned. Pass it to the XmlSignerService
 * to add the digital signature before sending to SUNAT.
 */
@Injectable()
export class XmlBuilderService {
  private readonly logger = new Logger(XmlBuilderService.name);
  private readonly invoiceBuilder = new InvoiceBuilder();
  private readonly creditNoteBuilder = new CreditNoteBuilder();
  private readonly debitNoteBuilder = new DebitNoteBuilder();
  private readonly summaryBuilder = new SummaryBuilder();
  private readonly voidedBuilder = new VoidedBuilder();
  private readonly retentionBuilder = new RetentionBuilder();
  private readonly perceptionBuilder = new PerceptionBuilder();
  private readonly guideBuilder = new GuideBuilder();

  /**
   * Build XML for a Factura (01) or Boleta (03).
   *
   * @param data - Complete invoice data including company, client, items, and totals
   * @returns Unsigned XML string ready for signing
   */
  buildInvoice(data: XmlInvoiceData): string {
    this.logger.log(
      `Building Invoice XML: ${data.serie}-${data.correlativo} (tipo ${data.tipoDoc})`,
    );

    const xml = this.invoiceBuilder.build(data);

    this.logger.debug(
      `Invoice XML built successfully: ${data.serie}-${data.correlativo} (${xml.length} bytes)`,
    );

    return xml;
  }

  /**
   * Build XML for a Nota de Credito (07).
   *
   * @param data - Complete credit note data including reference document and motivo
   * @returns Unsigned XML string ready for signing
   */
  buildCreditNote(data: XmlCreditNoteData): string {
    this.logger.log(
      `Building CreditNote XML: ${data.serie}-${data.correlativo} (ref: ${data.docRefSerie}-${data.docRefCorrelativo})`,
    );

    const xml = this.creditNoteBuilder.build(data);

    this.logger.debug(
      `CreditNote XML built successfully: ${data.serie}-${data.correlativo} (${xml.length} bytes)`,
    );

    return xml;
  }

  /**
   * Build XML for a Nota de Debito (08).
   *
   * @param data - Complete debit note data including reference document and motivo
   * @returns Unsigned XML string ready for signing
   */
  buildDebitNote(data: XmlDebitNoteData): string {
    this.logger.log(
      `Building DebitNote XML: ${data.serie}-${data.correlativo} (ref: ${data.docRefSerie}-${data.docRefCorrelativo})`,
    );

    const xml = this.debitNoteBuilder.build(data);

    this.logger.debug(
      `DebitNote XML built successfully: ${data.serie}-${data.correlativo} (${xml.length} bytes)`,
    );

    return xml;
  }

  /**
   * Build XML for a Resumen Diario (RC).
   *
   * @param data - Summary data including company and document lines
   * @returns Unsigned XML string ready for signing
   */
  buildSummary(data: XmlSummaryData): string {
    const dateStr = data.fechaEmision.replace(/-/g, '');
    const id = `RC-${dateStr}-${data.correlativo.toString().padStart(5, '0')}`;

    this.logger.log(
      `Building Summary XML: ${id} (${data.items.length} lines)`,
    );

    const xml = this.summaryBuilder.build(data);

    this.logger.debug(
      `Summary XML built successfully: ${id} (${xml.length} bytes)`,
    );

    return xml;
  }

  /**
   * Build XML for a Comunicación de Baja (RA).
   *
   * @param data - Voided data including company and document lines
   * @returns Unsigned XML string ready for signing
   */
  buildVoided(data: XmlVoidedData): string {
    const dateStr = data.fechaEmision.replace(/-/g, '');
    const id = `RA-${dateStr}-${data.correlativo.toString().padStart(5, '0')}`;

    this.logger.log(
      `Building Voided XML: ${id} (${data.items.length} lines)`,
    );

    const xml = this.voidedBuilder.build(data);

    this.logger.debug(
      `Voided XML built successfully: ${id} (${xml.length} bytes)`,
    );

    return xml;
  }

  /**
   * Build XML for a Comprobante de Retención (20).
   *
   * @param data - Complete retention data including agent, receiver, and document references
   * @returns Unsigned XML string ready for signing
   */
  buildRetention(data: XmlRetentionData): string {
    this.logger.log(
      `Building Retention XML: ${data.serie}-${data.correlativo} (regime ${data.regimenRetencion})`,
    );

    const xml = this.retentionBuilder.build(data);

    this.logger.debug(
      `Retention XML built successfully: ${data.serie}-${data.correlativo} (${xml.length} bytes)`,
    );

    return xml;
  }

  /**
   * Build XML for a Comprobante de Percepción (40).
   *
   * @param data - Complete perception data including agent, receiver, and document references
   * @returns Unsigned XML string ready for signing
   */
  buildPerception(data: XmlPerceptionData): string {
    this.logger.log(
      `Building Perception XML: ${data.serie}-${data.correlativo} (regime ${data.regimenPercepcion})`,
    );

    const xml = this.perceptionBuilder.build(data);

    this.logger.debug(
      `Perception XML built successfully: ${data.serie}-${data.correlativo} (${xml.length} bytes)`,
    );

    return xml;
  }

  /**
   * Build XML for a Guía de Remisión Electrónica (09).
   *
   * @param data - Complete guide data including shipment, addresses, and items
   * @returns Unsigned XML string ready for signing
   */
  buildGuide(data: XmlGuideData): string {
    this.logger.log(
      `Building Guide XML: ${data.serie}-${data.correlativo} (motivo ${data.motivoTraslado})`,
    );

    const xml = this.guideBuilder.build(data);

    this.logger.debug(
      `Guide XML built successfully: ${data.serie}-${data.correlativo} (${xml.length} bytes)`,
    );

    return xml;
  }
}
