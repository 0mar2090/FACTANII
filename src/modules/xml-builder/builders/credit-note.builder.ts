// ═══════════════════════════════════════════════════════════════════
// Credit Note XML Builder — Nota de Credito (07)
// Generates UBL 2.1 compliant XML for SUNAT Peru
// ═══════════════════════════════════════════════════════════════════

import { UBL_NAMESPACES, LEYENDA } from '../../../common/constants/index.js';
import type { XmlCreditNoteData } from '../interfaces/xml-builder.interfaces.js';
import { BaseXmlBuilder } from './base.builder.js';

/**
 * Builds the XML for Nota de Credito (tipo 07) documents.
 *
 * A credit note references an existing invoice (factura or boleta) and
 * includes a DiscrepancyResponse block with the reason for the credit.
 *
 * Key differences from Invoice:
 * - Root element is <CreditNote> with CreditNote namespace
 * - Includes cac:DiscrepancyResponse (motivo de la nota)
 * - Includes cac:BillingReference (documento referenciado)
 * - Line items use cac:CreditNoteLine / cbc:CreditedQuantity
 * - No PaymentTerms
 */
export class CreditNoteBuilder extends BaseXmlBuilder {
  /**
   * Build the complete Credit Note XML from the provided data.
   *
   * @param data - All credit note fields needed for XML generation
   * @returns The serialized XML string
   */
  build(data: XmlCreditNoteData): string {
    const doc = this.createDocument('CreditNote', UBL_NAMESPACES.CREDIT_NOTE);

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

    // 7. Discrepancy response — reason for the credit note
    const discrepancy = doc.ele('cac:DiscrepancyResponse');
    discrepancy
      .ele('cbc:ReferenceID')
        .txt(this.formatDocumentId(data.docRefSerie, data.docRefCorrelativo))
      .up();
    discrepancy
      .ele('cbc:ResponseCode')
        .att('listAgencyName', 'PE:SUNAT')
        .att('listName', 'Tipo de nota de credito')
        .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo09')
        .txt(data.motivoNota)
      .up();
    discrepancy
      .ele('cbc:Description')
        .txt(data.motivoDescripcion)
      .up();
    discrepancy.up();

    // 8. Billing reference — the document being credited
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
    );

    // 13. Legal monetary totals
    this.addLegalMonetaryTotal(
      doc,
      data.opGravadas,
      data.opExoneradas,
      data.opInafectas,
      data.igv,
      data.isc,
      data.icbper,
      0, // credit notes don't have descuentoGlobal
      0, // credit notes don't have otrosCargos
      data.totalVenta,
      data.moneda,
    );

    // 14. Credit note lines
    for (let i = 0; i < data.items.length; i++) {
      this.addDocumentLine(
        doc,
        data.items[i]!,
        i + 1,
        data.moneda,
        'cac:CreditNoteLine',
        'cbc:CreditedQuantity',
      );
    }

    return this.serializeXml(doc);
  }
}
