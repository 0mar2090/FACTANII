// ═══════════════════════════════════════════════════════════════════
// Invoice XML Builder — Factura (01) and Boleta (03)
// Generates UBL 2.1 compliant XML for SUNAT Peru
// ═══════════════════════════════════════════════════════════════════

import { create } from 'xmlbuilder2';
import { UBL_NAMESPACES, LEYENDA } from '../../../common/constants/index.js';
import type { XmlInvoiceData } from '../interfaces/xml-builder.interfaces.js';
import { BaseXmlBuilder } from './base.builder.js';

/** Type alias for the xmlbuilder2 builder object */
type XmlNode = ReturnType<typeof create>;

/**
 * Builds the XML for Factura (tipo 01) and Boleta (tipo 03) documents.
 *
 * The XML structure follows SUNAT's UBL 2.1 specification exactly:
 * - UBLExtensions (signature placeholder)
 * - Version identifiers
 * - Document ID and dates
 * - InvoiceTypeCode with operation type
 * - Legends (monto en letras, operacion gratuita)
 * - Currency code
 * - Signature reference
 * - Supplier and customer parties
 * - Payment terms (Contado / Credito with installments)
 * - Tax totals
 * - Legal monetary totals
 * - Invoice lines
 */
export class InvoiceBuilder extends BaseXmlBuilder {
  /**
   * Build the complete Invoice XML from the provided data.
   *
   * @param data - All invoice fields needed for XML generation
   * @returns The serialized XML string
   */
  build(data: XmlInvoiceData): string {
    const doc = this.createDocument('Invoice', UBL_NAMESPACES.INVOICE);

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

    // 5. Due date (optional)
    if (data.fechaVencimiento) {
      doc.ele('cbc:DueDate').txt(data.fechaVencimiento).up();
    }

    // 6. Invoice type code with SUNAT attributes
    doc
      .ele('cbc:InvoiceTypeCode')
        .att('listAgencyName', 'PE:SUNAT')
        .att('listName', 'Tipo de Documento')
        .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01')
        .att('listID', data.tipoOperacion)
        .att('name', 'Tipo de Operacion')
        .att('listSchemeURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo51')
        .txt(data.tipoDoc)
      .up();

    // 7. Legends
    this.addLegend(doc, LEYENDA.MONTO_EN_LETRAS, data.montoEnLetras);

    // Legend for free operations
    if (data.opGratuitas > 0) {
      this.addLegend(doc, LEYENDA.OPERACION_GRATUITA, 'TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE');
    }

    // Legend for detracción (SPOT)
    if (data.detraccion) {
      this.addLegend(doc, LEYENDA.OPERACION_DETRACCION,
        'Operación sujeta al Sistema de Pago de Obligaciones Tributarias con el Gobierno Central');
    }

    // Legend for IVAP operations
    if (data.opIvap && data.opIvap > 0) {
      this.addLegend(doc, LEYENDA.OPERACION_IVAP, 'Operación sujeta al Impuesto a la Venta de Arroz Pilado');
    }

    // Legend for ICBPER
    if (data.icbper > 0) {
      this.addLegend(doc, LEYENDA.ICBPER,
        'Incluye el Impuesto al Consumo de las Bolsas de Plástico');
    }

    // 8. Document currency
    doc
      .ele('cbc:DocumentCurrencyCode')
        .att('listID', 'ISO 4217 Alpha')
        .att('listName', 'Currency')
        .att('listAgencyName', 'United Nations Economic Commission for Europe')
        .txt(data.moneda)
      .up();

    // 9. Signature reference
    this.addSignatureReference(doc, data.company.ruc);

    // 9b. OrderReference — contingencia (tipoOperacion '0401')
    if (data.orderReferenceId) {
      doc
        .ele('cac:OrderReference')
          .ele('cbc:ID').txt(data.orderReferenceId).up()
        .up();
    }

    // 10. Supplier (company)
    this.addCompanySupplier(doc, data.company);

    // 11. Customer (client)
    this.addClient(doc, data.client);

    // 12. Payment terms
    this.addPaymentTerms(doc, data);

    // 12b. Detracción (SPOT) — PaymentMeans
    if (data.detraccion) {
      this.addDetraccion(doc, data);
    }

    // 12c. Anticipos (PrepaidPayment)
    if (data.anticipos && data.anticipos.length > 0) {
      for (const anticipo of data.anticipos) {
        const prep = doc.ele('cac:PrepaidPayment');
        prep.ele('cbc:ID').txt(`${anticipo.tipoDoc}-${anticipo.serie}-${anticipo.correlativo}`).up();
        prep
          .ele('cbc:PaidAmount')
            .att('currencyID', anticipo.moneda)
            .txt(this.formatAmount(anticipo.monto))
          .up();
        prep.ele('cbc:PaidDate').txt(anticipo.fechaPago).up();
        prep.up();
      }
    }

    // 12d. Documentos relacionados
    if (data.documentosRelacionados && data.documentosRelacionados.length > 0) {
      for (const docRef of data.documentosRelacionados) {
        const addRef = doc.ele('cac:AdditionalDocumentReference');
        addRef.ele('cbc:ID').txt(docRef.numero).up();
        addRef.ele('cbc:DocumentTypeCode').txt(docRef.tipoDoc).up();
        addRef.up();
      }
    }

    // 13. Global discount (if applicable)
    if (data.descuentoGlobal > 0) {
      const discountBase = data.opGravadas + data.opExoneradas + data.opInafectas + (data.opExportacion ?? 0);
      const discountFactor = discountBase > 0 ? data.descuentoGlobal / discountBase : 0;

      const allowance = doc.ele('cac:AllowanceCharge');
      allowance.ele('cbc:ChargeIndicator').txt('false').up();
      allowance.ele('cbc:AllowanceChargeReasonCode').txt('02').up();
      allowance.ele('cbc:MultiplierFactorNumeric').txt(discountFactor.toFixed(5)).up();
      allowance
        .ele('cbc:Amount')
          .att('currencyID', data.moneda)
          .txt(this.formatAmount(data.descuentoGlobal))
        .up();
      allowance
        .ele('cbc:BaseAmount')
          .att('currencyID', data.moneda)
          .txt(this.formatAmount(discountBase))
        .up();
      allowance.up();
    }

    // 14. Tax totals (document level)
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

    // 15. Legal monetary totals
    this.addLegalMonetaryTotal(
      doc,
      data.opGravadas,
      data.opExoneradas,
      data.opInafectas,
      data.igv,
      data.isc,
      data.icbper,
      data.descuentoGlobal,
      data.otrosCargos,
      data.totalVenta,
      data.moneda,
      data.opIvap ?? 0,
      data.opExportacion ?? 0,
    );

    // 16. Line count
    doc.ele('cbc:LineCountNumeric').txt(data.items.length.toString()).up();

    // 17. Invoice lines
    for (let i = 0; i < data.items.length; i++) {
      this.addDocumentLine(
        doc,
        data.items[i]!,
        i + 1,
        data.moneda,
        'cac:InvoiceLine',
        'cbc:InvoicedQuantity',
      );
    }

    return this.serializeXml(doc);
  }

  /**
   * Add detracción (SPOT) payment means to the XML.
   *
   * SUNAT requires PaymentMeans with specific structure when tipoOperacion='1001'.
   */
  private addDetraccion(doc: XmlNode, data: XmlInvoiceData): void {
    const det = data.detraccion!;

    const paymentMeans = doc.ele('cac:PaymentMeans');
    const medioPagoCode = det.medioPago ?? '001';
    paymentMeans.ele('cbc:PaymentMeansCode')
      .att('listAgencyName', 'PE:SUNAT')
      .att('listName', 'Medio de pago')
      .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo59')
      .txt(medioPagoCode)
    .up();

    const payeeAccount = paymentMeans.ele('cac:PayeeFinancialAccount');
    payeeAccount.ele('cbc:ID').txt(det.cuentaBN).up();
    payeeAccount.up();

    paymentMeans.up();

    const paymentTermsDet = doc.ele('cac:PaymentTerms');
    paymentTermsDet.ele('cbc:ID').txt('Detraccion').up();
    paymentTermsDet.ele('cbc:PaymentMeansID').txt(det.codigo).up();
    paymentTermsDet.ele('cbc:PaymentPercent').txt((det.porcentaje * 100).toFixed(2)).up();
    paymentTermsDet
      .ele('cbc:Amount')
        .att('currencyID', 'PEN')
        .txt(this.formatAmount(det.monto))
      .up();
    paymentTermsDet.up();
  }

  /**
   * Add payment terms: Contado or Credito with installment schedule.
   *
   * SUNAT requires:
   * - For "Contado": a single PaymentTerms with ID "FormaPago" and PaymentMeansID "Contado"
   * - For "Credito": a PaymentTerms block for the credit declaration, plus one
   *   PaymentTerms block per installment (cuota)
   */
  private addPaymentTerms(doc: XmlNode, data: XmlInvoiceData): void {
    const terms = doc.ele('cac:PaymentTerms');
    terms.ele('cbc:ID').txt('FormaPago').up();
    terms.ele('cbc:PaymentMeansID').txt(data.formaPago.formaPago).up();

    if (data.formaPago.formaPago === 'Credito') {
      terms
        .ele('cbc:Amount')
          .att('currencyID', data.moneda)
          .txt(this.formatAmount(data.totalVenta))
        .up();
    }

    terms.up();

    // Add installments for credit sales
    if (data.formaPago.formaPago === 'Credito' && data.formaPago.cuotas) {
      for (let i = 0; i < data.formaPago.cuotas.length; i++) {
        const cuota = data.formaPago.cuotas[i]!;
        const cuotaTerms = doc.ele('cac:PaymentTerms');
        cuotaTerms.ele('cbc:ID').txt('FormaPago').up();
        cuotaTerms.ele('cbc:PaymentMeansID').txt(`Cuota${(i + 1).toString().padStart(3, '0')}`).up();
        cuotaTerms
          .ele('cbc:Amount')
            .att('currencyID', cuota.moneda)
            .txt(this.formatAmount(cuota.monto))
          .up();
        cuotaTerms.ele('cbc:PaymentDueDate').txt(cuota.fechaPago).up();
        cuotaTerms.up();
      }
    }
  }
}
