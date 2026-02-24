// ═══════════════════════════════════════════════════════════════════
// Base XML Builder — Shared UBL 2.1 helpers for SUNAT CPE
// Uses xmlbuilder2 to construct XML documents
// ═══════════════════════════════════════════════════════════════════

import { create } from 'xmlbuilder2';
import {
  UBL_NAMESPACES,
  CODIGO_TRIBUTO,
  TIPO_PRECIO,
  IGV_RATE,
  IVAP_RATE,
} from '../../../common/constants/index.js';
import {
  isGravado,
  isExonerado,
  isInafecto,
  isExportacion,
  isGratuita,
  isIvap,
} from '../../../common/utils/tax-calculator.js';
import type {
  XmlCompany,
  XmlClient,
  XmlInvoiceItem,
} from '../interfaces/xml-builder.interfaces.js';

/** Type alias for the xmlbuilder2 builder object returned by create() */
export type XmlNode = ReturnType<typeof create>;

/**
 * Base class providing shared XML building methods for all SUNAT UBL 2.1 documents.
 *
 * All concrete builders (Invoice, CreditNote, DebitNote) extend this class
 * and use its helper methods to construct the common XML blocks.
 */
export abstract class BaseXmlBuilder {
  /**
   * Zero-pad a correlativo number to 8 digits.
   * SUNAT requires format: FXXX-00000001
   */
  protected padCorrelativo(correlativo: number): string {
    return correlativo.toString().padStart(8, '0');
  }

  /**
   * Format a document ID: {serie}-{correlativo padded to 8 digits}
   */
  protected formatDocumentId(serie: string, correlativo: number): string {
    return `${serie}-${this.padCorrelativo(correlativo)}`;
  }

  /**
   * Format a number to a fixed number of decimal places.
   *
   * Uses exponential-notation rounding to avoid IEEE 754 floating-point
   * errors that cause SUNAT rejections (errors 2508/2510).
   * Example: (1.005).toFixed(2) = "1.00" (WRONG), this method returns "1.01".
   */
  protected formatAmount(value: number, decimals = 2): string {
    if (!Number.isFinite(value)) return (0).toFixed(decimals);
    const rounded = Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
    return rounded.toFixed(decimals);
  }

  /**
   * Create a new XML document with the specified root element and all UBL namespaces.
   *
   * @param rootElement - The root element name (e.g. 'Invoice', 'CreditNote', 'DebitNote')
   * @param rootNamespace - The root namespace URI
   * @returns The root XMLBuilder element
   */
  protected createDocument(rootElement: string, rootNamespace: string): XmlNode {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele(rootNamespace, rootElement)
      .att('xmlns:cac', UBL_NAMESPACES.CAC)
      .att('xmlns:cbc', UBL_NAMESPACES.CBC)
      .att('xmlns:ds', UBL_NAMESPACES.DS)
      .att('xmlns:ext', UBL_NAMESPACES.EXT)
      .att('xmlns:sac', UBL_NAMESPACES.SAC)
      .att('xmlns:qdt', UBL_NAMESPACES.QDT)
      .att('xmlns:udt', UBL_NAMESPACES.UDT);

    return doc;
  }

  /**
   * Add the UBLExtensions container with an empty ExtensionContent
   * placeholder for the digital signature.
   *
   * The xml-signer module will later inject the actual signature
   * into the ext:ExtensionContent element.
   */
  protected addExtensionContainer(parent: XmlNode): void {
    parent
      .ele('ext:UBLExtensions')
        .ele('ext:UBLExtension')
          .ele('ext:ExtensionContent')
          .up()
        .up()
      .up();
  }

  /**
   * Add UBL version and customization IDs.
   * SUNAT requires UBLVersionID=2.1 and CustomizationID=2.0
   */
  protected addUblVersions(parent: XmlNode): void {
    parent.ele('cbc:UBLVersionID').txt('2.1').up();
    parent.ele('cbc:CustomizationID').txt('2.0').up();
  }

  /**
   * Add the cac:Signature element referencing the digital signature.
   *
   * This is a placeholder reference; the actual cryptographic signature
   * is in UBLExtensions. The ID must match what the signer uses.
   */
  protected addSignatureReference(parent: XmlNode, ruc: string): void {
    const sig = parent.ele('cac:Signature');
    sig.ele('cbc:ID').txt('SignatureSP').up();

    const signatoryParty = sig.ele('cac:SignatoryParty');
    signatoryParty
      .ele('cac:PartyIdentification')
        .ele('cbc:ID').txt(ruc).up()
      .up();
    signatoryParty
      .ele('cac:PartyName')
        .ele('cbc:Name').txt(ruc).up()
      .up();
    signatoryParty.up();

    sig
      .ele('cac:DigitalSignatureAttachment')
        .ele('cac:ExternalReference')
          .ele('cbc:URI').txt('#SignatureSP').up()
        .up()
      .up();

    sig.up();
  }

  /**
   * Add the cac:AccountingSupplierParty block (the issuing company).
   *
   * Includes registration name, trade name, RUC, full address with
   * UBIGEO, and country code.
   */
  protected addCompanySupplier(parent: XmlNode, company: XmlCompany): void {
    const supplier = parent.ele('cac:AccountingSupplierParty');
    const party = supplier.ele('cac:Party');

    // PartyIdentification — RUC
    party
      .ele('cac:PartyIdentification')
        .ele('cbc:ID')
          .att('schemeID', '6')
          .att('schemeName', 'Documento de Identidad')
          .att('schemeAgencyName', 'PE:SUNAT')
          .att('schemeURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06')
          .txt(company.ruc)
        .up()
      .up();

    // PartyName — Nombre comercial
    if (company.nombreComercial) {
      party
        .ele('cac:PartyName')
          .ele('cbc:Name')
            .dat(company.nombreComercial)
          .up()
        .up();
    }

    // PartyLegalEntity — Razon social + direccion
    const legalEntity = party.ele('cac:PartyLegalEntity');
    legalEntity
      .ele('cbc:RegistrationName')
        .dat(company.razonSocial)
      .up();

    const address = legalEntity.ele('cac:RegistrationAddress');
    address.ele('cbc:ID').txt(company.ubigeo).up();
    address.ele('cbc:AddressTypeCode').txt('0000').up();
    address.ele('cbc:CitySubdivisionName').txt(company.urbanizacion || '-').up();
    address.ele('cbc:CityName').txt(company.provincia).up();
    address.ele('cbc:CountrySubentity').txt(company.departamento).up();
    address.ele('cbc:District').txt(company.distrito).up();

    address
      .ele('cac:AddressLine')
        .ele('cbc:Line').dat(company.direccion).up()
      .up();

    address
      .ele('cac:Country')
        .ele('cbc:IdentificationCode')
          .att('listID', 'ISO 3166-1')
          .att('listAgencyName', 'United Nations Economic Commission for Europe')
          .att('listName', 'Country')
          .txt(company.codigoPais)
        .up()
      .up();

    address.up();
    legalEntity.up();
    party.up();
    supplier.up();
  }

  /**
   * Add the cac:AccountingCustomerParty block (the buyer/receiver).
   *
   * Includes document type, document number, name, and optional address.
   */
  protected addClient(parent: XmlNode, client: XmlClient): void {
    const customer = parent.ele('cac:AccountingCustomerParty');
    const party = customer.ele('cac:Party');

    // PartyIdentification — Document identity
    party
      .ele('cac:PartyIdentification')
        .ele('cbc:ID')
          .att('schemeID', client.tipoDocIdentidad)
          .att('schemeName', 'Documento de Identidad')
          .att('schemeAgencyName', 'PE:SUNAT')
          .att('schemeURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06')
          .txt(client.numDocIdentidad)
        .up()
      .up();

    // PartyLegalEntity — Name and address
    const legalEntity = party.ele('cac:PartyLegalEntity');
    legalEntity
      .ele('cbc:RegistrationName')
        .dat(client.nombre)
      .up();

    if (client.direccion) {
      legalEntity
        .ele('cac:RegistrationAddress')
          .ele('cac:AddressLine')
            .ele('cbc:Line').dat(client.direccion).up()
          .up()
        .up();
    }

    legalEntity.up();
    party.up();
    customer.up();
  }

  /**
   * Add the document-level cac:TaxTotal block with all applicable tax subtotals.
   *
   * SUNAT requires a TaxTotal with one TaxSubtotal per tax type present
   * (IGV, ISC, ICBPER, etc.), plus subtotals for exonerado, inafecto,
   * exportacion, and gratuito when those operation totals are non-zero.
   */
  protected addTaxTotal(
    parent: XmlNode,
    igv: number,
    isc: number,
    icbper: number,
    opGravadas: number,
    opExoneradas: number,
    opInafectas: number,
    opGratuitas: number,
    moneda: string,
    opIvap = 0,
    igvIvap = 0,
    opExportacion = 0,
  ): void {
    const totalTaxAmount = igv + igvIvap + isc + icbper;
    const taxTotal = parent.ele('cac:TaxTotal');

    taxTotal
      .ele('cbc:TaxAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(totalTaxAmount))
      .up();

    // IGV subtotal (always present when there are gravado operations, excluding IVAP)
    if (opGravadas > 0 || igv > 0) {
      this.addTaxSubtotal(
        taxTotal,
        opGravadas,
        igv,
        moneda,
        'S',
        CODIGO_TRIBUTO.IGV,
      );
    }

    // IVAP subtotal (tipo 17 — separate TaxScheme code 1016 at 4%)
    if (opIvap > 0 || igvIvap > 0) {
      this.addTaxSubtotal(
        taxTotal,
        opIvap,
        igvIvap,
        moneda,
        'S',
        CODIGO_TRIBUTO.IVAP,
      );
    }

    // ISC subtotal
    if (isc > 0) {
      this.addTaxSubtotal(
        taxTotal,
        opGravadas,
        isc,
        moneda,
        'S',
        CODIGO_TRIBUTO.ISC,
      );
    }

    // ICBPER subtotal
    if (icbper > 0) {
      this.addTaxSubtotal(
        taxTotal,
        0,
        icbper,
        moneda,
        'S',
        CODIGO_TRIBUTO.ICBPER,
      );
    }

    // Exonerado subtotal
    if (opExoneradas > 0) {
      this.addTaxSubtotal(
        taxTotal,
        opExoneradas,
        0,
        moneda,
        'E',
        CODIGO_TRIBUTO.EXONERADO,
      );
    }

    // Inafecto subtotal
    if (opInafectas > 0) {
      this.addTaxSubtotal(
        taxTotal,
        opInafectas,
        0,
        moneda,
        'O',
        CODIGO_TRIBUTO.INAFECTO,
      );
    }

    // Exportación subtotal (TaxScheme 9995)
    if (opExportacion > 0) {
      this.addTaxSubtotal(
        taxTotal,
        opExportacion,
        0,
        moneda,
        'G',
        CODIGO_TRIBUTO.EXPORTACION,
      );
    }

    // Gratuito subtotal
    if (opGratuitas > 0) {
      this.addTaxSubtotal(
        taxTotal,
        opGratuitas,
        0,
        moneda,
        'Z',
        CODIGO_TRIBUTO.GRATUITO,
      );
    }

    taxTotal.up();
  }

  /**
   * Add a single cac:TaxSubtotal element within a TaxTotal.
   *
   * @param parent - The TaxTotal XMLBuilder element
   * @param taxableAmount - The taxable base amount
   * @param taxAmount - The calculated tax amount
   * @param moneda - Currency code (PEN, USD, etc.)
   * @param categoryId - Tax category ID (S, E, O, G, Z)
   * @param tributo - Tax scheme data from CODIGO_TRIBUTO
   */
  protected addTaxSubtotal(
    parent: XmlNode,
    taxableAmount: number,
    taxAmount: number,
    moneda: string,
    categoryId: string,
    tributo: { code: string; name: string; un: string },
  ): void {
    const subtotal = parent.ele('cac:TaxSubtotal');

    subtotal
      .ele('cbc:TaxableAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(taxableAmount))
      .up();

    subtotal
      .ele('cbc:TaxAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(taxAmount))
      .up();

    const taxCategory = subtotal.ele('cac:TaxCategory');
    taxCategory.ele('cbc:ID')
      .att('schemeID', 'UN/ECE 5305')
      .att('schemeAgencyID', '6')
      .txt(categoryId)
    .up();

    // Tax percentage — resolve based on tributo type
    const taxPercent = this.resolveTaxPercent(tributo.code, taxableAmount, taxAmount);
    taxCategory.ele('cbc:Percent').txt(taxPercent.toFixed(2)).up();

    const taxScheme = taxCategory.ele('cac:TaxScheme');
    taxScheme.ele('cbc:ID')
      .att('schemeID', 'UN/ECE 5153')
      .att('schemeAgencyID', '6')
      .txt(tributo.code)
    .up();
    taxScheme.ele('cbc:Name').txt(tributo.name).up();
    taxScheme.ele('cbc:TaxTypeCode').txt(tributo.un).up();
    taxScheme.up();

    taxCategory.up();
    subtotal.up();
  }

  /**
   * Resolve the tax percent based on the tributo code.
   *
   * - IGV (1000): 18%
   * - IVAP (1016): 4%
   * - ISC (2000): derived from taxAmount / taxableAmount if possible, else 0%
   * - All others: 0%
   */
  protected resolveTaxPercent(tributoCode: string, taxableAmount: number, taxAmount: number): number {
    if (tributoCode === CODIGO_TRIBUTO.IGV.code) {
      return IGV_RATE * 100;
    }
    if (tributoCode === CODIGO_TRIBUTO.IVAP?.code) {
      return 4;
    }
    if (tributoCode === CODIGO_TRIBUTO.ISC.code) {
      // Derive ISC rate from amounts when possible
      if (taxableAmount > 0 && taxAmount > 0) {
        return Math.round((taxAmount / taxableAmount) * 10000) / 100;
      }
      return 0;
    }
    return 0;
  }

  /**
   * Add a single invoice line (cac:InvoiceLine) element.
   *
   * Each line includes: ID, invoiced quantity, line extension amount,
   * pricing reference (unit price with/without tax), per-item tax total,
   * item description/code, and the base price.
   *
   * @param parent - The root document element
   * @param item - The line item data
   * @param lineNumber - 1-based sequential line number
   * @param moneda - Currency code
   * @param lineElementName - 'cac:InvoiceLine', 'cac:CreditNoteLine', or 'cac:DebitNoteLine'
   * @param quantityElementName - 'cbc:InvoicedQuantity', 'cbc:CreditedQuantity', or 'cbc:DebitedQuantity'
   */
  protected addDocumentLine(
    parent: XmlNode,
    item: XmlInvoiceItem,
    lineNumber: number,
    moneda: string,
    lineElementName: string,
    quantityElementName: string,
  ): void {
    const line = parent.ele(lineElementName);

    // Line ID (sequential number)
    line.ele('cbc:ID').txt(lineNumber.toString()).up();

    // Quantity with unit code
    line
      .ele(quantityElementName)
        .att('unitCode', item.unidadMedida)
        .att('unitCodeListID', 'UN/ECE rec 20')
        .att('unitCodeListAgencyName', 'United Nations Economic Commission for Europe')
        .txt(this.formatAmount(item.cantidad, 3))
      .up();

    // Line extension amount (valor venta = cantidad * valor unitario)
    line
      .ele('cbc:LineExtensionAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(item.valorVenta))
      .up();

    // Pricing reference — Price the customer sees
    this.addPricingReference(line, item, moneda);

    // Discount at item level
    if (item.descuento > 0) {
      const baseAmount = item.cantidad * item.valorUnitario;
      const discountFactor = baseAmount > 0 ? item.descuento / baseAmount : 0;

      const allowanceCharge = line.ele('cac:AllowanceCharge');
      allowanceCharge.ele('cbc:ChargeIndicator').txt('false').up();
      allowanceCharge.ele('cbc:AllowanceChargeReasonCode').txt('00').up();
      allowanceCharge.ele('cbc:MultiplierFactorNumeric').txt(discountFactor.toFixed(5)).up();
      allowanceCharge
        .ele('cbc:Amount')
          .att('currencyID', moneda)
          .txt(this.formatAmount(item.descuento))
        .up();
      allowanceCharge
        .ele('cbc:BaseAmount')
          .att('currencyID', moneda)
          .txt(this.formatAmount(baseAmount))
        .up();
      allowanceCharge.up();
    }

    // Per-line tax total
    this.addLineTaxTotal(line, item, moneda);

    // Item details (description, code)
    const itemElement = line.ele('cac:Item');
    itemElement
      .ele('cbc:Description')
        .dat(item.descripcion)
      .up();

    if (item.codigo) {
      itemElement
        .ele('cac:SellersItemIdentification')
          .ele('cbc:ID').txt(item.codigo).up()
        .up();
    }

    if (item.codigoSunat) {
      itemElement
        .ele('cac:CommodityClassification')
          .ele('cbc:ItemClassificationCode')
            .att('listID', 'UNSPSC')
            .att('listAgencyName', 'GS1 US')
            .att('listName', 'Item Classification')
            .txt(item.codigoSunat)
          .up()
        .up();
    }

    itemElement.up();

    // Base price (valor unitario sin impuestos)
    line
      .ele('cac:Price')
        .ele('cbc:PriceAmount')
          .att('currencyID', moneda)
          .txt(this.formatAmount(item.valorUnitario, 10))
        .up()
      .up();

    line.up();
  }

  /**
   * Add the cac:PricingReference block for a line item.
   *
   * Contains the price the customer sees:
   * - For onerosa (non-free) operations: precio unitario con IGV (tipo 01)
   * - For gratuita (free) operations: valor referencial (tipo 02)
   */
  private addPricingReference(
    parent: XmlNode,
    item: XmlInvoiceItem,
    moneda: string,
  ): void {
    const pricingRef = parent.ele('cac:PricingReference');

    if (isGratuita(item.tipoAfectacion)) {
      // Valor referencial para operaciones gratuitas
      pricingRef
        .ele('cac:AlternativeConditionPrice')
          .ele('cbc:PriceAmount')
            .att('currencyID', moneda)
            .txt(this.formatAmount(item.precioUnitario, 10))
          .up()
          .ele('cbc:PriceTypeCode')
            .att('listName', 'Tipo de Precio')
            .att('listAgencyName', 'PE:SUNAT')
            .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16')
            .txt(TIPO_PRECIO.VALOR_REFERENCIAL_GRATUITO)
          .up()
        .up();
    } else {
      // Precio unitario con IGV para operaciones onerosas
      pricingRef
        .ele('cac:AlternativeConditionPrice')
          .ele('cbc:PriceAmount')
            .att('currencyID', moneda)
            .txt(this.formatAmount(item.precioUnitario, 10))
          .up()
          .ele('cbc:PriceTypeCode')
            .att('listName', 'Tipo de Precio')
            .att('listAgencyName', 'PE:SUNAT')
            .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16')
            .txt(TIPO_PRECIO.PRECIO_UNITARIO_CON_IGV)
          .up()
        .up();
    }

    pricingRef.up();
  }

  /**
   * Add the per-line cac:TaxTotal block for a single item.
   *
   * Each line carries its own tax total with the correct tax category
   * based on the item's tipoAfectacion (Catalogo 07).
   */
  private addLineTaxTotal(
    parent: XmlNode,
    item: XmlInvoiceItem,
    moneda: string,
  ): void {
    const lineTaxAmount = item.igv + item.isc + item.icbper;
    const taxTotal = parent.ele('cac:TaxTotal');

    taxTotal
      .ele('cbc:TaxAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(lineTaxAmount))
      .up();

    // Determine tax category and scheme based on tipoAfectacion
    const { categoryId, tributo } = this.resolveTaxCategory(item.tipoAfectacion);

    // IGV/Exonerado/Inafecto/Gratuito/Exportacion subtotal
    const subtotal = taxTotal.ele('cac:TaxSubtotal');

    subtotal
      .ele('cbc:TaxableAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(item.valorVenta))
      .up();

    subtotal
      .ele('cbc:TaxAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(item.igv))
      .up();

    const taxCategory = subtotal.ele('cac:TaxCategory');
    taxCategory
      .ele('cbc:ID')
        .att('schemeID', 'UN/ECE 5305')
        .att('schemeAgencyID', '6')
        .txt(categoryId)
      .up();

    const linePercent = isGravado(item.tipoAfectacion)
      ? (isIvap(item.tipoAfectacion) ? IVAP_RATE * 100 : IGV_RATE * 100)
      : 0;
    taxCategory
      .ele('cbc:Percent')
        .txt(linePercent.toFixed(2))
      .up();

    taxCategory
      .ele('cbc:TaxExemptionReasonCode')
        .att('listAgencyName', 'PE:SUNAT')
        .att('listName', 'Afectacion del IGV')
        .att('listURI', 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07')
        .txt(item.tipoAfectacion)
      .up();

    const taxScheme = taxCategory.ele('cac:TaxScheme');
    taxScheme.ele('cbc:ID')
      .att('schemeID', 'UN/ECE 5153')
      .att('schemeAgencyID', '6')
      .txt(tributo.code)
    .up();
    taxScheme.ele('cbc:Name').txt(tributo.name).up();
    taxScheme.ele('cbc:TaxTypeCode').txt(tributo.un).up();
    taxScheme.up();

    taxCategory.up();
    subtotal.up();

    // ISC subtotal (if applicable)
    if (item.isc > 0) {
      this.addTaxSubtotal(
        taxTotal,
        item.valorVenta,
        item.isc,
        moneda,
        'S',
        CODIGO_TRIBUTO.ISC,
      );
    }

    // ICBPER subtotal (if applicable)
    if (item.icbper > 0) {
      const icbperSubtotal = taxTotal.ele('cac:TaxSubtotal');
      // ICBPER TaxableAmount = number of plastic bags (cantidad) per SUNAT rule
      icbperSubtotal
        .ele('cbc:TaxableAmount')
          .att('currencyID', moneda)
          .txt(this.formatAmount(item.cantidad))
        .up();
      icbperSubtotal
        .ele('cbc:TaxAmount')
          .att('currencyID', moneda)
          .txt(this.formatAmount(item.icbper))
        .up();

      const icbperCategory = icbperSubtotal.ele('cac:TaxCategory');
      icbperCategory
        .ele('cbc:ID')
          .att('schemeID', 'UN/ECE 5305')
          .att('schemeAgencyID', '6')
          .txt('S')
        .up();

      const icbperScheme = icbperCategory.ele('cac:TaxScheme');
      icbperScheme.ele('cbc:ID')
        .att('schemeID', 'UN/ECE 5153')
        .att('schemeAgencyID', '6')
        .txt(CODIGO_TRIBUTO.ICBPER.code)
      .up();
      icbperScheme.ele('cbc:Name').txt(CODIGO_TRIBUTO.ICBPER.name).up();
      icbperScheme.ele('cbc:TaxTypeCode').txt(CODIGO_TRIBUTO.ICBPER.un).up();
      icbperScheme.up();
      icbperCategory.up();
      icbperSubtotal.up();
    }

    taxTotal.up();
  }

  /**
   * Resolve the tax category ID and tributo scheme based on tipoAfectacion (Cat 07).
   *
   * Mapping:
   * - 10-17 (gravado)     -> S, IGV
   * - 20-21 (exonerado)   -> E, EXONERADO
   * - 30-36 (inafecto)    -> O, INAFECTO
   * - 40    (exportacion)  -> G, EXPORTACION
   * - 11-17,21,31-36 (gratuito) -> special handling: uses IGV scheme
   *   but with category Z for gratuitas that are gravado-origin
   */
  protected resolveTaxCategory(tipoAfectacion: string): {
    categoryId: string;
    tributo: { code: string; name: string; un: string };
  } {
    if (isGratuita(tipoAfectacion)) {
      // Gratuitas that originate from gravado items (11-16) use IGV scheme
      const code = parseInt(tipoAfectacion, 10);
      if (code >= 11 && code <= 16) {
        return { categoryId: 'Z', tributo: CODIGO_TRIBUTO.IGV };
      }
      // Gratuitas from exonerado (21) or inafecto (31-36) use GRATUITO
      return { categoryId: 'Z', tributo: CODIGO_TRIBUTO.GRATUITO };
    }

    // IVAP (tipo 17) uses tributo code 1016, NOT IGV 1000
    if (isIvap(tipoAfectacion)) {
      return { categoryId: 'S', tributo: CODIGO_TRIBUTO.IVAP };
    }

    if (isExportacion(tipoAfectacion)) {
      return { categoryId: 'G', tributo: CODIGO_TRIBUTO.EXPORTACION };
    }

    if (isExonerado(tipoAfectacion)) {
      return { categoryId: 'E', tributo: CODIGO_TRIBUTO.EXONERADO };
    }

    if (isInafecto(tipoAfectacion)) {
      return { categoryId: 'O', tributo: CODIGO_TRIBUTO.INAFECTO };
    }

    // Default: gravado (10)
    return { categoryId: 'S', tributo: CODIGO_TRIBUTO.IGV };
  }

  /**
   * Add a SUNAT legend note (cbc:Note with languageLocaleID).
   *
   * SUNAT legends carry codes from Catalogo 52, e.g.:
   * - 1000: Monto en letras
   * - 1002: Operacion gratuita
   */
  protected addLegend(parent: XmlNode, code: string, value: string): void {
    parent
      .ele('cbc:Note')
        .att('languageLocaleID', code)
        .dat(value)
      .up();
  }

  /**
   * Add the cac:LegalMonetaryTotal block with all monetary totals.
   *
   * Contains: LineExtensionAmount, TaxInclusiveAmount, AllowanceTotalAmount,
   * ChargeTotalAmount, and PayableAmount.
   */
  protected addLegalMonetaryTotal(
    parent: XmlNode,
    opGravadas: number,
    opExoneradas: number,
    opInafectas: number,
    igv: number,
    isc: number,
    icbper: number,
    descuentoGlobal: number,
    otrosCargos: number,
    totalVenta: number,
    moneda: string,
    opIvap = 0,
    opExportacion = 0,
  ): void {
    const lineExtension = opGravadas + opIvap + opExoneradas + opInafectas + opExportacion;
    const taxInclusive = totalVenta;

    const monetaryTotal = parent.ele('cac:LegalMonetaryTotal');

    monetaryTotal
      .ele('cbc:LineExtensionAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(lineExtension))
      .up();

    monetaryTotal
      .ele('cbc:TaxInclusiveAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(taxInclusive))
      .up();

    if (descuentoGlobal > 0) {
      monetaryTotal
        .ele('cbc:AllowanceTotalAmount')
          .att('currencyID', moneda)
          .txt(this.formatAmount(descuentoGlobal))
        .up();
    }

    if (otrosCargos > 0) {
      monetaryTotal
        .ele('cbc:ChargeTotalAmount')
          .att('currencyID', moneda)
          .txt(this.formatAmount(otrosCargos))
        .up();
    }

    monetaryTotal
      .ele('cbc:PayableAmount')
        .att('currencyID', moneda)
        .txt(this.formatAmount(totalVenta))
      .up();

    monetaryTotal.up();
  }

  /**
   * Serialize the built XML document to a string.
   */
  protected serializeXml(doc: XmlNode): string {
    return doc.end({ prettyPrint: true });
  }
}
