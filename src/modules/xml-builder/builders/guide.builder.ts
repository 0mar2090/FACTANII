// ═══════════════════════════════════════════════════════════════════
// Guide XML Builder — Guía de Remisión Electrónica (09)
// Generates UBL 2.1 compliant DespatchAdvice XML for SUNAT Peru
// ═══════════════════════════════════════════════════════════════════

import { create } from 'xmlbuilder2';
import { UBL_NAMESPACES } from '../../../common/constants/index.js';
import type {
  XmlGuideData,
  XmlGuideItem,
} from '../interfaces/xml-builder.interfaces.js';
import { BaseXmlBuilder, type XmlNode } from './base.builder.js';

/**
 * Builds the XML for Guía de Remisión Electrónica (tipo 09).
 *
 * Uses the DespatchAdvice UBL 2.1 schema. Structure:
 * - UBLExtensions (signature placeholder)
 * - UBLVersionID = 2.1, CustomizationID = 2.0
 * - ID, IssueDate
 * - DespatchAdviceTypeCode = 09
 * - Note (optional)
 * - Signature reference
 * - DespatchSupplierParty (remitente)
 * - DeliveryCustomerParty (destinatario)
 * - Shipment { ID, HandlingCode, GrossWeightMeasure,
 *   TransportHandlingUnit, ShipmentStage, Delivery, Despatch }
 * - DespatchLine[] (items)
 */
export class GuideBuilder extends BaseXmlBuilder {
  build(data: XmlGuideData): string {
    const doc = this.createGuideDocument();

    // 1. UBLExtensions
    this.addExtensionContainer(doc);

    // 2. Version IDs
    this.addUblVersions(doc);

    // 2b. Profile ID
    doc.ele('cbc:ProfileID').txt('0101').up();

    // 3. Document ID
    const documentId = this.formatDocumentId(data.serie, data.correlativo);
    doc.ele('cbc:ID').txt(documentId).up();

    // 4. Issue date
    doc.ele('cbc:IssueDate').txt(data.fechaEmision).up();

    // 5. Document type code (Cat 01)
    doc
      .ele('cbc:DespatchAdviceTypeCode')
        .att('listAgencyName', 'PE:SUNAT')
        .att('listName', 'Tipo de Documento')
        .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01')
        .txt('09')
      .up();

    // 6. Note (motivo description)
    if (data.descripcionMotivo) {
      doc.ele('cbc:Note').txt(data.descripcionMotivo).up();
    }

    // 7. AdditionalDocumentReference (must come before Signature per UBL 2.1 schema)
    if (data.docReferencia) {
      this.addOrderReference(doc, data);
    }

    // 8. Signature reference
    this.addSignatureReference(doc, data.company.ruc);

    // 9. Despatch supplier party (remitente)
    this.addDespatchSupplierParty(doc, data);

    // 10. Delivery customer party (destinatario)
    this.addDeliveryCustomerParty(doc, data);

    // 11. Shipment
    this.addShipment(doc, data);

    // 12. Despatch lines
    for (let i = 0; i < data.items.length; i++) {
      this.addDespatchLine(doc, data.items[i]!, i + 1);
    }

    return this.serializeXml(doc);
  }

  private createGuideDocument() {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele(UBL_NAMESPACES.DESPATCH_ADVICE, 'DespatchAdvice')
      .att('xmlns:cac', UBL_NAMESPACES.CAC)
      .att('xmlns:cbc', UBL_NAMESPACES.CBC)
      .att('xmlns:ds', UBL_NAMESPACES.DS)
      .att('xmlns:ext', UBL_NAMESPACES.EXT)
      .att('xmlns:sac', UBL_NAMESPACES.SAC);

    return doc;
  }

  private addDespatchSupplierParty(doc: XmlNode, data: XmlGuideData): void {
    const supplier = doc.ele('cac:DespatchSupplierParty');
    const party = supplier.ele('cac:Party');

    party
      .ele('cac:PartyIdentification')
        .ele('cbc:ID')
          .att('schemeID', '6')
          .txt(data.company.ruc)
        .up()
      .up();

    party
      .ele('cac:PartyLegalEntity')
        .ele('cbc:RegistrationName')
          .dat(data.company.razonSocial)
        .up()
      .up();

    party.up();
    supplier.up();
  }

  private addDeliveryCustomerParty(doc: XmlNode, data: XmlGuideData): void {
    const customer = doc.ele('cac:DeliveryCustomerParty');
    const party = customer.ele('cac:Party');

    party
      .ele('cac:PartyIdentification')
        .ele('cbc:ID')
          .att('schemeID', data.destinatario.tipoDocIdentidad)
          .txt(data.destinatario.numDocIdentidad)
        .up()
      .up();

    party
      .ele('cac:PartyLegalEntity')
        .ele('cbc:RegistrationName')
          .dat(data.destinatario.nombre)
        .up()
      .up();

    party.up();
    customer.up();
  }

  private addOrderReference(doc: XmlNode, data: XmlGuideData): void {
    if (!data.docReferencia) return;

    const ref = data.docReferencia;
    const docId = `${ref.serieDoc}-${String(ref.correlativoDoc).padStart(8, '0')}`;

    const orderRef = doc.ele('cac:AdditionalDocumentReference');
    orderRef.ele('cbc:ID').txt(docId).up();
    orderRef
      .ele('cbc:DocumentTypeCode')
        .att('listAgencyName', 'PE:SUNAT')
        .att('listName', 'Tipo de Documento')
        .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01')
        .txt(ref.tipoDoc)
      .up();
    orderRef.up();
  }

  private addShipment(doc: XmlNode, data: XmlGuideData): void {
    const shipment = doc.ele('cac:Shipment');

    // Shipment ID (required, use "1" as per SUNAT)
    shipment.ele('cbc:ID').txt('1').up();

    // Handling code = motivo de traslado (Cat 20)
    shipment
      .ele('cbc:HandlingCode')
        .att('listAgencyName', 'PE:SUNAT')
        .att('listName', 'Motivo de traslado')
        .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20')
        .txt(data.motivoTraslado)
      .up();

    // Handling instructions (description)
    if (data.descripcionMotivo) {
      shipment.ele('cbc:HandlingInstructions').txt(data.descripcionMotivo).up();
    }

    // Gross weight
    shipment
      .ele('cbc:GrossWeightMeasure')
        .att('unitCode', data.unidadPeso)
        .txt(this.formatAmount(data.pesoTotal, 3))
      .up();

    // Number of packages
    if (data.numeroBultos) {
      shipment.ele('cbc:TotalTransportHandlingUnitQuantity').txt(data.numeroBultos.toString()).up();
    }

    // Shipment stage (transport mode, carrier, driver)
    this.addShipmentStage(shipment, data);

    // Delivery (destination address)
    const delivery = shipment.ele('cac:Delivery');
    const deliveryAddress = delivery.ele('cac:DeliveryAddress');
    deliveryAddress.ele('cbc:ID').txt(data.puntoLlegada.ubigeo).up();
    deliveryAddress
      .ele('cac:AddressLine')
        .ele('cbc:Line').txt(data.puntoLlegada.direccion).up()
      .up();
    deliveryAddress.up();
    delivery.up();

    // Despatch (origin address)
    const despatch = shipment.ele('cac:Despatch');
    const despatchAddress = despatch.ele('cac:DespatchAddress');
    despatchAddress.ele('cbc:ID').txt(data.puntoPartida.ubigeo).up();
    despatchAddress
      .ele('cac:AddressLine')
        .ele('cbc:Line').txt(data.puntoPartida.direccion).up()
      .up();
    despatchAddress.up();
    despatch.up();

    // Special authorization (hazardous goods, etc.)
    if (data.autorizacionEspecial) {
      shipment
        .ele('cac:SpecialInstructions')
          .ele('cbc:ID').txt(data.autorizacionEspecial).up()
        .up();
    }

    // Transport handling unit (vehicle)
    if (data.vehiculo) {
      const thu = shipment.ele('cac:TransportHandlingUnit');
      const te = thu.ele('cac:TransportEquipment');
      te.ele('cbc:ID').txt(data.vehiculo.placa).up();
      if (data.vehiculo.tipoEquipo) {
        te.ele('cbc:TransportEquipmentTypeCode').txt(data.vehiculo.tipoEquipo).up();
      }
      te.up();

      if (data.vehiculo.placaSecundaria) {
        const te2 = thu.ele('cac:TransportEquipment');
        te2.ele('cbc:ID').txt(data.vehiculo.placaSecundaria).up();
        te2.up();
      }

      thu.up();
    }

    shipment.up();
  }

  private addShipmentStage(shipment: XmlNode, data: XmlGuideData): void {
    const stage = shipment.ele('cac:ShipmentStage');

    // Transport mode code (Cat 18)
    stage
      .ele('cbc:TransportModeCode')
        .att('listName', 'Modalidad de traslado')
        .att('listAgencyName', 'PE:SUNAT')
        .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18')
        .txt(data.modalidadTransporte)
      .up();

    // Transit period (fecha traslado)
    stage
      .ele('cac:TransitPeriod')
        .ele('cbc:StartDate').txt(data.fechaTraslado).up()
      .up();

    // Carrier party (if public transport)
    if (data.transportista) {
      const carrier = stage.ele('cac:CarrierParty');
      carrier
        .ele('cac:PartyIdentification')
          .ele('cbc:ID')
            .att('schemeID', data.transportista.tipoDoc)
            .txt(data.transportista.numDoc)
          .up()
        .up();
      const carrierLegal = carrier.ele('cac:PartyLegalEntity');
      carrierLegal
        .ele('cbc:RegistrationName')
          .dat(data.transportista.nombre)
        .up();
      if (data.transportista.registroMTC) {
        carrierLegal.ele('cbc:CompanyID').txt(data.transportista.registroMTC).up();
      }
      carrierLegal.up();

      // Subcontratación indicator
      if (data.transportista.subcontratacion) {
        carrier
          .ele('cac:AgentParty')
            .ele('cac:PartyIdentification')
              .ele('cbc:ID')
                .att('schemeID', 'SUBT')
                .txt('true')
              .up()
            .up()
          .up();
      }

      carrier.up();
    }

    // Driver persons — support multiple conductores
    const conductores = data.conductores ?? (data.conductor ? [data.conductor] : []);
    if (conductores.length === 0 && data.modalidadTransporte === '02') {
      console.warn('[GuideBuilder] No conductores provided for DespatchAdvice with private transport (modalidad 02)');
    }
    for (let i = 0; i < conductores.length; i++) {
      const cond = conductores[i]!;
      const driver = stage.ele('cac:DriverPerson');
      driver
        .ele('cbc:ID')
          .att('schemeID', cond.tipoDoc)
          .txt(cond.numDoc)
        .up();
      driver.ele('cbc:FirstName').txt(cond.nombres).up();
      driver.ele('cbc:FamilyName').txt(cond.apellidos).up();
      driver.ele('cbc:JobTitle').txt(i === 0 ? 'Principal' : 'Secundario').up();

      if (cond.licencia) {
        const identity = driver.ele('cac:IdentityDocumentReference');
        identity.ele('cbc:ID').txt(cond.licencia).up();
        identity.up();
      }

      driver.up();
    }

    stage.up();
  }

  private addDespatchLine(doc: XmlNode, item: XmlGuideItem, lineNumber: number): void {
    const line = doc.ele('cac:DespatchLine');

    line.ele('cbc:ID').txt(lineNumber.toString()).up();

    line
      .ele('cbc:DeliveredQuantity')
        .att('unitCode', item.unidadMedida)
        .txt(this.formatAmount(item.cantidad, 3))
      .up();

    // Order line reference (required by SUNAT)
    line
      .ele('cac:OrderLineReference')
        .ele('cbc:LineID').txt(lineNumber.toString()).up()
      .up();

    // Item details
    const itemEle = line.ele('cac:Item');
    itemEle.ele('cbc:Description').dat(item.descripcion).up();

    if (item.codigo) {
      itemEle
        .ele('cac:SellersItemIdentification')
          .ele('cbc:ID').txt(item.codigo).up()
        .up();
    }

    itemEle.up();
    line.up();
  }
}
