// ═══════════════════════════════════════════════════════════════════
// Summary XML Builder — Resumen Diario (RC)
// Generates SUNAT SummaryDocuments XML
// ═══════════════════════════════════════════════════════════════════

import { create } from 'xmlbuilder2';
import { UBL_NAMESPACES, CODIGO_TRIBUTO } from '../../../common/constants/index.js';
import type { XmlSummaryData } from '../interfaces/xml-builder.interfaces.js';
import { BaseXmlBuilder } from './base.builder.js';

/** Type alias for the xmlbuilder2 builder object */
type XmlNode = ReturnType<typeof create>;

/**
 * Builds the XML for Resumen Diario (SummaryDocuments) — RC.
 *
 * A daily summary groups boletas and their notes into a single document
 * sent asynchronously to SUNAT via `sendSummary`. SUNAT responds with
 * a ticket that must be polled via `getStatus`.
 *
 * Key characteristics:
 * - Root element is <SummaryDocuments> with SUNAT-specific namespace
 * - UBLVersionID=2.0, CustomizationID=1.1
 * - Contains cbc:ReferenceDate (date of the original documents)
 * - Lines use sac:SummaryDocumentsLine
 * - Each line has a status code: 1=Add, 2=Modify, 3=Void
 * - File name format: {RUC}-RC-{YYYYMMDD}-{NNNNN}
 */
export class SummaryBuilder extends BaseXmlBuilder {
  /**
   * Build the complete Summary XML from the provided data.
   *
   * @param data - Summary data including company and document lines
   * @returns The serialized XML string
   */
  build(data: XmlSummaryData): string {
    const doc = this.createSummaryDocument();

    // 1. UBLExtensions — empty container for digital signature
    this.addExtensionContainer(doc);

    // 2. Version identifiers (different from invoices)
    doc.ele('cbc:UBLVersionID').txt('2.0').up();
    doc.ele('cbc:CustomizationID').txt('1.1').up();

    // 3. Document ID: RC-YYYYMMDD-NNNNN
    const dateStr = data.fechaEmision.replace(/-/g, '');
    const id = `RC-${dateStr}-${data.correlativo.toString().padStart(5, '0')}`;
    doc.ele('cbc:ID').txt(id).up();

    // 4. Reference date (date of the documents being summarized)
    doc.ele('cbc:ReferenceDate').txt(data.fechaReferencia).up();

    // 5. Issue date (date the summary is generated)
    doc.ele('cbc:IssueDate').txt(data.fechaEmision).up();

    // 6. Signature reference
    this.addSignatureReference(doc, data.company.ruc);

    // 7. Supplier
    this.addCompanySupplier(doc, data.company);

    // 8. Summary lines
    for (let i = 0; i < data.items.length; i++) {
      this.addSummaryLine(doc, data.items[i]!, i + 1);
    }

    return this.serializeXml(doc);
  }

  /**
   * Create a SummaryDocuments XML document with SUNAT-specific namespaces.
   */
  private createSummaryDocument(): XmlNode {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele(UBL_NAMESPACES.SUMMARY_DOCUMENTS, 'SummaryDocuments')
      .att('xmlns:cac', UBL_NAMESPACES.CAC)
      .att('xmlns:cbc', UBL_NAMESPACES.CBC)
      .att('xmlns:ds', UBL_NAMESPACES.DS)
      .att('xmlns:ext', UBL_NAMESPACES.EXT)
      .att('xmlns:sac', UBL_NAMESPACES.SAC);

    return doc;
  }

  /**
   * Add a single sac:SummaryDocumentsLine element.
   */
  private addSummaryLine(
    parent: XmlNode,
    item: XmlSummaryData['items'][number],
    lineNumber: number,
  ): void {
    const line = parent.ele('sac:SummaryDocumentsLine');

    // Line ID
    line.ele('cbc:LineID').txt(lineNumber.toString()).up();

    // Document type code
    line.ele('cbc:DocumentTypeCode').txt(item.tipoDoc).up();

    // Document ID (serie-correlativo)
    line
      .ele('cbc:ID')
        .txt(this.formatDocumentId(item.serie, item.correlativo))
      .up();

    // Customer
    const customer = line.ele('cac:AccountingCustomerParty');
    customer
      .ele('cbc:CustomerAssignedAccountID')
        .txt(item.clienteNumDoc)
      .up();
    customer
      .ele('cbc:AdditionalAccountID')
        .txt(item.clienteTipoDoc)
      .up();
    customer.up();

    // Reference for credit/debit notes
    if (item.docRefTipo && item.docRefSerie && item.docRefCorrelativo) {
      const billingRef = line.ele('cac:BillingReference');
      const invoiceRef = billingRef.ele('cac:InvoiceDocumentReference');
      invoiceRef
        .ele('cbc:ID')
          .txt(this.formatDocumentId(item.docRefSerie, item.docRefCorrelativo))
        .up();
      invoiceRef
        .ele('cbc:DocumentTypeCode')
          .txt(item.docRefTipo)
        .up();
      invoiceRef.up();
      billingRef.up();
    }

    // Status (1=Add, 2=Modify, 3=Void)
    const status = line.ele('cac:Status');
    status.ele('cbc:ConditionCode').txt(item.estado).up();
    status.up();

    // Total amount
    line
      .ele('sac:TotalAmount')
        .att('currencyID', item.moneda)
        .txt(this.formatAmount(item.totalVenta))
      .up();

    // Billing payments (operation totals)
    if (item.opGravadas > 0) {
      this.addBillingPayment(line, item.opGravadas, item.moneda, '01');
    }
    if (item.opExoneradas > 0) {
      this.addBillingPayment(line, item.opExoneradas, item.moneda, '02');
    }
    if (item.opInafectas > 0) {
      this.addBillingPayment(line, item.opInafectas, item.moneda, '03');
    }
    if (item.opGratuitas > 0) {
      this.addBillingPayment(line, item.opGratuitas, item.moneda, '05');
    }

    // Other charges (only emit when > 0)
    if (item.otrosCargos > 0) {
      const allowance = line.ele('cac:AllowanceCharge');
      allowance.ele('cbc:ChargeIndicator').txt('true').up();
      allowance
        .ele('cbc:Amount')
          .att('currencyID', item.moneda)
          .txt(this.formatAmount(item.otrosCargos))
        .up();
      allowance.up();
    }

    // Tax totals
    const taxTotal = line.ele('cac:TaxTotal');
    const totalTax = item.igv + item.isc + item.icbper;
    taxTotal
      .ele('cbc:TaxAmount')
        .att('currencyID', item.moneda)
        .txt(this.formatAmount(totalTax))
      .up();

    // IGV subtotal
    if (item.igv > 0 || item.opGravadas > 0) {
      this.addSummaryTaxSubtotal(taxTotal, item.igv, item.moneda, CODIGO_TRIBUTO.IGV);
    }

    // ISC subtotal
    if (item.isc > 0) {
      this.addSummaryTaxSubtotal(taxTotal, item.isc, item.moneda, CODIGO_TRIBUTO.ISC);
    }

    // ICBPER subtotal
    if (item.icbper > 0) {
      this.addSummaryTaxSubtotal(taxTotal, item.icbper, item.moneda, CODIGO_TRIBUTO.ICBPER);
    }

    // Exonerado subtotal
    if (item.opExoneradas > 0) {
      this.addSummaryTaxSubtotal(taxTotal, 0, item.moneda, CODIGO_TRIBUTO.EXONERADO);
    }

    // Inafecto subtotal
    if (item.opInafectas > 0) {
      this.addSummaryTaxSubtotal(taxTotal, 0, item.moneda, CODIGO_TRIBUTO.INAFECTO);
    }

    // Gratuito subtotal
    if (item.opGratuitas > 0) {
      this.addSummaryTaxSubtotal(taxTotal, 0, item.moneda, CODIGO_TRIBUTO.GRATUITO);
    }

    taxTotal.up();
    line.up();
  }

  /**
   * Add a sac:BillingPayment block for operation type totals.
   *
   * @param instructionId - 01=Gravado, 02=Exonerado, 03=Inafecto, 05=Gratuito
   */
  private addBillingPayment(
    parent: XmlNode,
    amount: number,
    moneda: string,
    instructionId: string,
  ): void {
    const payment = parent.ele('sac:BillingPayment');
    payment
      .ele('cbc:PaidAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(amount))
      .up();
    payment
      .ele('cbc:InstructionID')
        .txt(instructionId)
      .up();
    payment.up();
  }

  /**
   * Add a simplified TaxSubtotal for summary documents.
   */
  private addSummaryTaxSubtotal(
    parent: XmlNode,
    taxAmount: number,
    moneda: string,
    tributo: { code: string; name: string; un: string },
  ): void {
    const subtotal = parent.ele('cac:TaxSubtotal');
    subtotal
      .ele('cbc:TaxAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(taxAmount))
      .up();

    const taxCategory = subtotal.ele('cac:TaxCategory');
    const taxScheme = taxCategory.ele('cac:TaxScheme');
    taxScheme.ele('cbc:ID').txt(tributo.code).up();
    taxScheme.ele('cbc:Name').txt(tributo.name).up();
    taxScheme.ele('cbc:TaxTypeCode').txt(tributo.un).up();
    taxScheme.up();
    taxCategory.up();
    subtotal.up();
  }
}
