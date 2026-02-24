// ═══════════════════════════════════════════════════════════════════
// Perception XML Builder — Comprobante de Percepción (40)
// Generates UBL 2.0 compliant XML for SUNAT Peru
// ═══════════════════════════════════════════════════════════════════

import { create } from 'xmlbuilder2';
import { UBL_NAMESPACES } from '../../../common/constants/index.js';
import type {
  XmlPerceptionData,
  XmlPerceptionLine,
} from '../interfaces/xml-builder.interfaces.js';
import { BaseXmlBuilder, type XmlNode } from './base.builder.js';

/**
 * Builds the XML for Comprobante de Percepción (tipo 40).
 *
 * SUNAT perception documents use UBL 2.0 with the custom SUNAT
 * Perception namespace. Structure mirrors retention with perception-specific elements.
 */
export class PerceptionBuilder extends BaseXmlBuilder {
  build(data: XmlPerceptionData): string {
    const doc = this.createPerceptionDocument();

    // 1. UBLExtensions
    this.addExtensionContainer(doc);

    // 2. Version IDs (Perception: UBL 2.0, Customization 1.0 per SUNAT CPE schema)
    doc.ele('cbc:UBLVersionID').txt('2.0').up();
    doc.ele('cbc:CustomizationID').txt('1.0').up();

    // 3. Signature reference
    this.addSignatureReference(doc, data.company.ruc);

    // 4. Document ID
    const documentId = this.formatDocumentId(data.serie, data.correlativo);
    doc.ele('cbc:ID').txt(documentId).up();

    // 5. Issue date
    doc.ele('cbc:IssueDate').txt(data.fechaEmision).up();

    // 6. Agent party (emisor = agente de percepción)
    this.addAgentParty(doc, data);

    // 7. Receiver party (cliente = sujeto percibido)
    this.addReceiverParty(doc, data);

    // 8. Perception system code (régimen)
    doc.ele('sac:SUNATPerceptionSystemCode').txt(data.regimenPercepcion).up();

    // 9. Perception percent
    doc.ele('sac:SUNATPerceptionPercent').txt((data.tasaPercepcion * 100).toFixed(2)).up();

    // 10. Note
    doc.ele('cbc:Note').txt('COMPROBANTE DE PERCEPCION ELECTRONICA').up();

    // 11. Total invoice amount
    const totalImporte = data.items.reduce((sum, item) => sum + item.importeTotal, 0);
    doc
      .ele('cbc:TotalInvoiceAmount')
        .att('currencyID', data.moneda)
        .txt(this.formatAmount(totalImporte))
      .up();

    // 12. Total collected (cobrado + percepción)
    doc
      .ele('sac:SUNATTotalCashed')
        .att('currencyID', data.moneda)
        .txt(this.formatAmount(data.totalCobrado))
      .up();

    // 13. Total perceived
    doc
      .ele('sac:SUNATTotalPaid')
        .att('currencyID', data.moneda)
        .txt(this.formatAmount(data.totalPercibido))
      .up();

    // 14. Document reference lines
    for (const item of data.items) {
      this.addPerceptionDocumentReference(doc, item, data.moneda);
    }

    return this.serializeXml(doc);
  }

  private createPerceptionDocument() {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele(UBL_NAMESPACES.PERCEPTION, 'Perception')
      .att('xmlns:cac', UBL_NAMESPACES.CAC)
      .att('xmlns:cbc', UBL_NAMESPACES.CBC)
      .att('xmlns:ds', UBL_NAMESPACES.DS)
      .att('xmlns:ext', UBL_NAMESPACES.EXT)
      .att('xmlns:sac', UBL_NAMESPACES.SAC);

    return doc;
  }

  private addAgentParty(doc: XmlNode, data: XmlPerceptionData): void {
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

  private addReceiverParty(doc: XmlNode, data: XmlPerceptionData): void {
    const receiver = doc.ele('cac:ReceiverParty');

    receiver
      .ele('cac:PartyIdentification')
        .ele('cbc:ID')
          .att('schemeID', data.cliente.tipoDocIdentidad)
          .txt(data.cliente.numDocIdentidad)
        .up()
      .up();

    receiver
      .ele('cac:PartyName')
        .ele('cbc:Name')
          .dat(data.cliente.nombre)
        .up()
      .up();

    if (data.cliente.direccion) {
      receiver
        .ele('cac:PostalAddress')
          .ele('cac:AddressLine')
            .ele('cbc:Line').txt(data.cliente.direccion).up()
          .up()
        .up();
    }

    receiver
      .ele('cac:PartyLegalEntity')
        .ele('cbc:RegistrationName')
          .dat(data.cliente.nombre)
        .up()
      .up();

    receiver.up();
  }

  private addPerceptionDocumentReference(
    doc: XmlNode,
    item: XmlPerceptionLine,
    moneda: string,
  ): void {
    const ref = doc.ele('sac:SUNATPerceptionDocumentReference');

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

    // Payment/collection info
    const payment = ref.ele('cac:Payment');
    payment.ele('cbc:ID').txt('1').up();
    payment
      .ele('cbc:PaidAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(item.importeCobrado))
      .up();
    payment.ele('cbc:PaidDate').txt(item.fechaCobro).up();
    payment.up();

    // Perception info
    const perInfo = ref.ele('sac:SUNATPerceptionInformation');
    perInfo
      .ele('sac:SUNATPerceptionAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(item.importePercibido))
      .up();
    perInfo.ele('sac:SUNATPerceptionDate').txt(item.fechaCobro).up();
    perInfo
      .ele('sac:SUNATNetTotalCashed')
        .att('currencyID', moneda)
        .txt(this.formatAmount(item.importeCobrado))
      .up();

    // Exchange rate if foreign currency
    if (item.tipoCambio && item.moneda !== 'PEN') {
      const exchange = perInfo.ele('cac:ExchangeRate');
      exchange.ele('cbc:SourceCurrencyCode').txt(item.moneda).up();
      exchange.ele('cbc:TargetCurrencyCode').txt('PEN').up();
      exchange.ele('cbc:CalculationRate').txt(item.tipoCambio.toFixed(6)).up();
      exchange.ele('cbc:Date').txt(item.fechaCobro).up();
      exchange.up();
    }

    perInfo.up();
    ref.up();
  }
}
