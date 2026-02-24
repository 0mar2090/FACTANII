// ═══════════════════════════════════════════════════════════════════
// Retention XML Builder — Comprobante de Retención (20)
// Generates UBL 2.0 compliant XML for SUNAT Peru
// ═══════════════════════════════════════════════════════════════════

import { create } from 'xmlbuilder2';
import { UBL_NAMESPACES } from '../../../common/constants/index.js';
import type {
  XmlRetentionData,
  XmlRetentionLine,
} from '../interfaces/xml-builder.interfaces.js';
import { BaseXmlBuilder, type XmlNode } from './base.builder.js';

/**
 * Builds the XML for Comprobante de Retención (tipo 20).
 *
 * SUNAT retention documents use UBL 2.0 (not 2.1) with the custom
 * SUNAT Retention namespace. The structure is:
 * - UBLExtensions (signature placeholder)
 * - UBLVersionID = 2.0, CustomizationID = 2.0
 * - Signature reference
 * - ID (serie-correlativo)
 * - IssueDate
 * - AgentParty (emisor = agente de retención)
 * - ReceiverParty (proveedor = sujeto retenido)
 * - SUNATRetentionSystemCode (régimen)
 * - SUNATRetentionPercent (tasa %)
 * - TotalInvoiceAmount
 * - SUNATTotalPaid
 * - SUNATTotalCashed
 * - SUNATRetentionDocumentReference[] (líneas)
 */
export class RetentionBuilder extends BaseXmlBuilder {
  build(data: XmlRetentionData): string {
    const doc = this.createRetentionDocument();

    // 1. UBLExtensions
    this.addExtensionContainer(doc);

    // 2. Version IDs (Retention: UBL 2.0, Customization 1.0 per SUNAT CRE schema)
    doc.ele('cbc:UBLVersionID').txt('2.0').up();
    doc.ele('cbc:CustomizationID').txt('1.0').up();

    // 3. Signature reference
    this.addSignatureReference(doc, data.company.ruc);

    // 4. Document ID
    const documentId = this.formatDocumentId(data.serie, data.correlativo);
    doc.ele('cbc:ID').txt(documentId).up();

    // 5. Issue date
    doc.ele('cbc:IssueDate').txt(data.fechaEmision).up();

    // 6. Agent party (emisor = agente de retención)
    this.addAgentParty(doc, data);

    // 7. Receiver party (proveedor = sujeto retenido)
    this.addReceiverParty(doc, data);

    // 8. Retention system code (régimen)
    doc.ele('sac:SUNATRetentionSystemCode').txt(data.regimenRetencion).up();

    // 9. Retention percent
    doc.ele('sac:SUNATRetentionPercent').txt((data.tasaRetencion * 100).toFixed(2)).up();

    // 10. Note (optional)
    doc.ele('cbc:Note').txt('COMPROBANTE DE RETENCION ELECTRONICA').up();

    // 11. Total invoice amount (sum of related document amounts)
    const totalImporte = data.items.reduce((sum, item) => sum + item.importeTotal, 0);
    doc
      .ele('cbc:TotalInvoiceAmount')
        .att('currencyID', data.moneda)
        .txt(this.formatAmount(totalImporte))
      .up();

    // 12. Total paid (neto pagado)
    doc
      .ele('sac:SUNATTotalPaid')
        .att('currencyID', data.moneda)
        .txt(this.formatAmount(data.totalPagado))
      .up();

    // 13. Total retained
    doc
      .ele('sac:SUNATTotalCashed')
        .att('currencyID', data.moneda)
        .txt(this.formatAmount(data.totalRetenido))
      .up();

    // 14. Document reference lines
    for (const item of data.items) {
      this.addRetentionDocumentReference(doc, item, data.moneda);
    }

    return this.serializeXml(doc);
  }

  private createRetentionDocument() {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele(UBL_NAMESPACES.RETENTION, 'Retention')
      .att('xmlns:cac', UBL_NAMESPACES.CAC)
      .att('xmlns:cbc', UBL_NAMESPACES.CBC)
      .att('xmlns:ds', UBL_NAMESPACES.DS)
      .att('xmlns:ext', UBL_NAMESPACES.EXT)
      .att('xmlns:sac', UBL_NAMESPACES.SAC);

    return doc;
  }

  private addAgentParty(doc: XmlNode, data: XmlRetentionData): void {
    const agent = doc.ele('cac:AgentParty');

    agent
      .ele('cac:PartyIdentification')
        .ele('cbc:ID')
          .att('schemeID', '6')
          .txt(data.company.ruc)
        .up()
      .up();

    agent
      .ele('cac:PartyName')
        .ele('cbc:Name')
          .dat(data.company.nombreComercial || data.company.razonSocial)
        .up()
      .up();

    const address = agent.ele('cac:PostalAddress');
    address.ele('cbc:ID').txt(data.company.ubigeo).up();
    address
      .ele('cac:AddressLine')
        .ele('cbc:Line').txt(data.company.direccion).up()
      .up();
    address
      .ele('cac:Country')
        .ele('cbc:IdentificationCode').txt(data.company.codigoPais).up()
      .up();
    address.up();

    agent
      .ele('cac:PartyLegalEntity')
        .ele('cbc:RegistrationName')
          .dat(data.company.razonSocial)
        .up()
      .up();

    agent.up();
  }

  private addReceiverParty(doc: XmlNode, data: XmlRetentionData): void {
    const receiver = doc.ele('cac:ReceiverParty');

    receiver
      .ele('cac:PartyIdentification')
        .ele('cbc:ID')
          .att('schemeID', data.proveedor.tipoDocIdentidad)
          .txt(data.proveedor.numDocIdentidad)
        .up()
      .up();

    receiver
      .ele('cac:PartyName')
        .ele('cbc:Name')
          .dat(data.proveedor.nombre)
        .up()
      .up();

    if (data.proveedor.direccion) {
      receiver
        .ele('cac:PostalAddress')
          .ele('cac:AddressLine')
            .ele('cbc:Line').txt(data.proveedor.direccion).up()
          .up()
        .up();
    }

    receiver
      .ele('cac:PartyLegalEntity')
        .ele('cbc:RegistrationName')
          .dat(data.proveedor.nombre)
        .up()
      .up();

    receiver.up();
  }

  private addRetentionDocumentReference(
    doc: XmlNode,
    item: XmlRetentionLine,
    moneda: string,
  ): void {
    const ref = doc.ele('sac:SUNATRetentionDocumentReference');

    // Referenced document ID
    const docId = `${item.serieDocRelacionado}-${item.correlativoDocRelacionado.toString().padStart(8, '0')}`;
    ref
      .ele('cbc:ID')
        .att('schemeID', item.tipoDocRelacionado)
        .txt(docId)
      .up();

    // Issue date of referenced document
    ref.ele('cbc:IssueDate').txt(item.fechaDocRelacionado).up();

    // Total amount of referenced document
    ref
      .ele('cbc:TotalInvoiceAmount')
        .att('currencyID', item.moneda)
        .txt(this.formatAmount(item.importeTotal))
      .up();

    // Payment info
    const payment = ref.ele('cac:Payment');
    payment.ele('cbc:ID').txt('1').up();
    payment
      .ele('cbc:PaidAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(item.importePagado))
      .up();
    payment.ele('cbc:PaidDate').txt(item.fechaPago).up();
    payment.up();

    // Retention info
    const retInfo = ref.ele('sac:SUNATRetentionInformation');
    retInfo
      .ele('sac:SUNATRetentionAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(item.importeRetenido))
      .up();
    retInfo.ele('sac:SUNATRetentionDate').txt(item.fechaPago).up();
    retInfo
      .ele('sac:SUNATNetTotalPaid')
        .att('currencyID', moneda)
        .txt(this.formatAmount(item.importePagado))
      .up();

    // Exchange rate if foreign currency
    if (item.tipoCambio && item.moneda !== 'PEN') {
      const exchange = retInfo.ele('cac:ExchangeRate');
      exchange.ele('cbc:SourceCurrencyCode').txt(item.moneda).up();
      exchange.ele('cbc:TargetCurrencyCode').txt('PEN').up();
      exchange.ele('cbc:CalculationRate').txt(item.tipoCambio.toFixed(6)).up();
      exchange.ele('cbc:Date').txt(item.fechaPago).up();
      exchange.up();
    }

    retInfo.up();
    ref.up();
  }
}
