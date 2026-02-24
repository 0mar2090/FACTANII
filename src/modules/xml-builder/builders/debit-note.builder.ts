// ═══════════════════════════════════════════════════════════════════
// Debit Note XML Builder — Nota de Debito (08)
// Generates UBL 2.1 compliant XML for SUNAT Peru
// ═══════════════════════════════════════════════════════════════════

import { create } from 'xmlbuilder2';
import { UBL_NAMESPACES, LEYENDA } from '../../../common/constants/index.js';
import type { XmlDebitNoteData } from '../interfaces/xml-builder.interfaces.js';
import { BaseXmlBuilder } from './base.builder.js';

/** Type alias for the xmlbuilder2 builder object */
type XmlNode = ReturnType<typeof create>;

/**
 * Builds the XML for Nota de Debito (tipo 08) documents.
 *
 * A debit note references an existing invoice (factura or boleta) and
 * includes a DiscrepancyResponse block with the reason for the debit
 * (e.g., interest, value increase, penalties).
 *
 * Key differences from Invoice:
 * - Root element is <DebitNote> with DebitNote namespace
 * - Includes cac:DiscrepancyResponse (motivo de la nota)
 * - Includes cac:BillingReference (documento referenciado)
 * - Line items use cac:DebitNoteLine / cbc:DebitedQuantity
 * - No PaymentTerms
 * - Motivo codes from Catalogo 10 (not Catalogo 09)
 */
export class DebitNoteBuilder extends BaseXmlBuilder {
  /**
   * Build the complete Debit Note XML from the provided data.
   *
   * @param data - All debit note fields needed for XML generation
   * @returns The serialized XML string
   */
  build(data: XmlDebitNoteData): string {
    const doc = this.createDocument('DebitNote', UBL_NAMESPACES.DEBIT_NOTE);

    // 1. UBLExtensions — empty container for digital signature
    this.addExtensionContainer(doc);

    // 2. UBL version identifiers
    this.addUblVersions(doc);

    // 2b. Profile ID
    doc.ele('cbc:ProfileID').txt(data.tipoOperacion ?? '0101').up();

    // 3. Document identification
    const documentId = this.formatDocumentId(data.serie, data.correlativo);
    doc.ele('cbc:ID').txt(documentId).up();

    // 4. Issue date and time
    doc.ele('cbc:IssueDate').txt(data.fechaEmision).up();
    doc.ele('cbc:IssueTime').txt(data.horaEmision ?? '00:00:00').up();

    // 5. Legends
    this.addLegend(doc, LEYENDA.MONTO_EN_LETRAS, data.montoEnLetras);

    if (data.opGratuitas > 0) {
      this.addLegend(doc, LEYENDA.OPERACION_GRATUITA, 'TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE');
    }

    // 6. Document currency
    doc
      .ele('cbc:DocumentCurrencyCode')
        .att('listID', 'ISO 4217 Alpha')
        .att('listName', 'Currency')
        .att('listAgencyName', 'United Nations Economic Commission for Europe')
        .txt(data.moneda)
      .up();

    // 7. Discrepancy response — reason for the debit note
    const discrepancy = doc.ele('cac:DiscrepancyResponse');
    discrepancy
      .ele('cbc:ReferenceID')
        .txt(this.formatDocumentId(data.docRefSerie, data.docRefCorrelativo))
      .up();
    discrepancy
      .ele('cbc:ResponseCode')
        .att('listAgencyName', 'PE:SUNAT')
        .att('listName', 'Tipo de nota de debito')
        .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo10')
        .txt(data.motivoNota)
      .up();
    discrepancy
      .ele('cbc:Description')
        .txt(data.motivoDescripcion)
      .up();
    discrepancy.up();

    // 8. Billing reference — the document being debited
    const billingRef = doc.ele('cac:BillingReference');
    const invoiceDocRef = billingRef.ele('cac:InvoiceDocumentReference');
    invoiceDocRef
      .ele('cbc:ID')
        .txt(this.formatDocumentId(data.docRefSerie, data.docRefCorrelativo))
      .up();
    invoiceDocRef
      .ele('cbc:DocumentTypeCode')
        .att('listAgencyName', 'PE:SUNAT')
        .att('listName', 'Tipo de Documento')
        .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01')
        .txt(data.docRefTipo)
      .up();
    invoiceDocRef.up();
    billingRef.up();

    // 9. Signature reference
    this.addSignatureReference(doc, data.company.ruc);

    // 10. Supplier (company)
    this.addCompanySupplier(doc, data.company);

    // 11. Customer (client)
    this.addClient(doc, data.client);

    // 12. Tax totals (document level)
    this.addTaxTotal(
      doc,
      data.igv,
      data.isc,
      data.icbper,
      data.opGravadas,
      data.opExoneradas,
      data.opInafectas,
      data.opGratuitas,
      data.moneda,
      data.opIvap ?? 0,
      data.igvIvap ?? 0,
      data.opExportacion ?? 0,
    );

    // 13. Requested monetary totals (MUST come BEFORE DebitNoteLine per UBL 2.1 XSD)
    this.addRequestedMonetaryTotal(
      doc,
      data.opGravadas,
      data.opExoneradas,
      data.opInafectas,
      data.igv,
      data.isc,
      data.icbper,
      data.totalVenta,
      data.moneda,
      data.opIvap ?? 0,
      data.opExportacion ?? 0,
    );

    // 14. Debit note lines
    for (let i = 0; i < data.items.length; i++) {
      this.addDocumentLine(
        doc,
        data.items[i]!,
        i + 1,
        data.moneda,
        'cac:DebitNoteLine',
        'cbc:DebitedQuantity',
      );
    }

    return this.serializeXml(doc);
  }

  /**
   * Add the cac:RequestedMonetaryTotal block for debit notes.
   *
   * DebitNote uses RequestedMonetaryTotal instead of LegalMonetaryTotal,
   * but the structure is essentially the same.
   */
  private addRequestedMonetaryTotal(
    parent: XmlNode,
    opGravadas: number,
    opExoneradas: number,
    opInafectas: number,
    igv: number,
    isc: number,
    icbper: number,
    totalVenta: number,
    moneda: string,
    opIvap = 0,
    opExportacion = 0,
  ): void {
    const lineExtension = opGravadas + opIvap + opExoneradas + opInafectas + opExportacion;

    const monetaryTotal = parent.ele('cac:RequestedMonetaryTotal');

    monetaryTotal
      .ele('cbc:LineExtensionAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(lineExtension))
      .up();

    monetaryTotal
      .ele('cbc:TaxInclusiveAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(totalVenta))
      .up();

    monetaryTotal
      .ele('cbc:PayableAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(totalVenta))
      .up();

    monetaryTotal.up();
  }
}
