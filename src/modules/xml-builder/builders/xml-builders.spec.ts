import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { InvoiceBuilder } from './invoice.builder.js';
import { CreditNoteBuilder } from './credit-note.builder.js';
import { DebitNoteBuilder } from './debit-note.builder.js';
import { SummaryBuilder } from './summary.builder.js';
import { VoidedBuilder } from './voided.builder.js';
import type {
  XmlInvoiceData,
  XmlCreditNoteData,
  XmlDebitNoteData,
  XmlSummaryData,
  XmlVoidedData,
  XmlCompany,
  XmlClient,
  XmlInvoiceItem,
} from '../interfaces/xml-builder.interfaces.js';

// ── Shared test fixtures ──

const company: XmlCompany = {
  ruc: '20000000001',
  razonSocial: 'EMPRESA TEST SAC',
  nombreComercial: 'TEST SAC',
  direccion: 'AV. TEST 123',
  ubigeo: '150101',
  departamento: 'LIMA',
  provincia: 'LIMA',
  distrito: 'LIMA',
  codigoPais: 'PE',
};

const client: XmlClient = {
  tipoDocIdentidad: '6',
  numDocIdentidad: '20100000001',
  nombre: 'CLIENTE TEST SRL',
  direccion: 'JR. CLIENTE 456',
};

const item: XmlInvoiceItem = {
  cantidad: 2,
  unidadMedida: 'NIU',
  descripcion: 'Producto de prueba',
  codigo: 'PROD001',
  valorUnitario: 100,
  precioUnitario: 118,
  valorVenta: 200,
  tipoAfectacion: '10',
  igv: 36,
  isc: 0,
  icbper: 0,
  descuento: 0,
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

// ── Helper: parse XML string → JS object ──
function parseXml(xml: string): any {
  return parser.parse(xml);
}

// ═══════════════════════════════════════════════
// Invoice Builder (Factura 01 / Boleta 03)
// ═══════════════════════════════════════════════

describe('InvoiceBuilder', () => {
  const builder = new InvoiceBuilder();

  function makeInvoiceData(overrides: Partial<XmlInvoiceData> = {}): XmlInvoiceData {
    return {
      tipoDoc: '01',
      serie: 'F001',
      correlativo: 1,
      tipoOperacion: '0101',
      fechaEmision: '2026-02-23',
      moneda: 'PEN',
      company,
      client,
      items: [item],
      opGravadas: 200,
      opExoneradas: 0,
      opInafectas: 0,
      opGratuitas: 0,
      igv: 36,
      isc: 0,
      icbper: 0,
      otrosCargos: 0,
      descuentoGlobal: 0,
      totalVenta: 236,
      formaPago: { formaPago: 'Contado' },
      montoEnLetras: 'DOSCIENTOS TREINTA Y SEIS CON 00/100 SOLES',
      ...overrides,
    };
  }

  it('generates valid XML with Invoice root element', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('Invoice');
  });

  it('sets correct UBL namespaces', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2');
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2');
  });

  it('sets UBLVersionID=2.1 and CustomizationID=2.0', () => {
    const xml = builder.build(makeInvoiceData());
    const parsed = parseXml(xml);
    const inv = parsed.Invoice;
    expect(inv.UBLVersionID).toBe('2.1');
    expect(inv.CustomizationID).toBe('2.0');
  });

  it('formats document ID as serie-correlativo padded to 8 digits', () => {
    const xml = builder.build(makeInvoiceData({ correlativo: 42 }));
    const parsed = parseXml(xml);
    expect(parsed.Invoice.ID).toBe('F001-00000042');
  });

  it('includes IssueDate and IssueTime', () => {
    const xml = builder.build(makeInvoiceData());
    const parsed = parseXml(xml);
    expect(parsed.Invoice.IssueDate).toBe('2026-02-23');
    expect(parsed.Invoice.IssueTime).toBe('00:00:00');
  });

  it('sets InvoiceTypeCode with tipo doc and tipo operacion', () => {
    const xml = builder.build(makeInvoiceData());
    const parsed = parseXml(xml);
    const typeCode = parsed.Invoice.InvoiceTypeCode;
    expect(typeCode['#text']).toBe('01');
    expect(typeCode['@_listID']).toBe('0101');
  });

  it('includes supplier RUC with schemeID=6', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).toContain('20000000001');
    expect(xml).toContain('schemeID="6"');
  });

  it('includes customer data', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).toContain('20100000001');
    expect(xml).toContain('CLIENTE TEST SRL');
  });

  it('includes UBLExtensions for signature placeholder', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).toContain('UBLExtensions');
    expect(xml).toContain('ExtensionContent');
  });

  it('includes cac:Signature reference', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).toContain('SignatureSP');
    expect(xml).toContain('#SignatureSP');
  });

  it('includes legend with monto en letras', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).toContain('languageLocaleID="1000"');
    expect(xml).toContain('DOSCIENTOS TREINTA Y SEIS');
  });

  it('includes TaxTotal with correct IGV amount', () => {
    const xml = builder.build(makeInvoiceData());
    const parsed = parseXml(xml);
    const inv = parsed.Invoice;
    // Document-level TaxTotal
    const taxTotal = inv.TaxTotal;
    expect(taxTotal.TaxAmount['#text']).toBe('36.00');
    expect(taxTotal.TaxAmount['@_currencyID']).toBe('PEN');
  });

  it('includes LegalMonetaryTotal with correct amounts', () => {
    const xml = builder.build(makeInvoiceData());
    const parsed = parseXml(xml);
    const totals = parsed.Invoice.LegalMonetaryTotal;
    expect(totals.LineExtensionAmount['#text']).toBe('200.00');
    expect(totals.PayableAmount['#text']).toBe('236.00');
  });

  it('includes invoice line with correct quantities', () => {
    const xml = builder.build(makeInvoiceData());
    const parsed = parseXml(xml);
    const line = parsed.Invoice.InvoiceLine;
    expect(line.ID).toBe('1');
    expect(line.InvoicedQuantity['#text']).toBe('2.000');
    expect(line.InvoicedQuantity['@_unitCode']).toBe('NIU');
    expect(line.LineExtensionAmount['#text']).toBe('200.00');
  });

  it('includes PaymentTerms for Contado', () => {
    const xml = builder.build(makeInvoiceData());
    const parsed = parseXml(xml);
    const terms = parsed.Invoice.PaymentTerms;
    expect(terms.PaymentMeansID).toBe('Contado');
  });

  it('includes PaymentTerms with cuotas for Credito', () => {
    const xml = builder.build(makeInvoiceData({
      formaPago: {
        formaPago: 'Credito',
        cuotas: [
          { monto: 118, moneda: 'PEN', fechaPago: '2026-03-23' },
          { monto: 118, moneda: 'PEN', fechaPago: '2026-04-23' },
        ],
      },
    }));
    expect(xml).toContain('Credito');
    expect(xml).toContain('Cuota001');
    expect(xml).toContain('Cuota002');
    expect(xml).toContain('2026-03-23');
  });

  it('includes DueDate when fechaVencimiento is set', () => {
    const xml = builder.build(makeInvoiceData({ fechaVencimiento: '2026-03-23' }));
    const parsed = parseXml(xml);
    expect(parsed.Invoice.DueDate).toBe('2026-03-23');
  });

  it('includes gratuita legend when opGratuitas > 0', () => {
    const xml = builder.build(makeInvoiceData({ opGratuitas: 50 }));
    expect(xml).toContain('languageLocaleID="1002"');
    expect(xml).toContain('TRANSFERENCIA GRATUITA');
  });

  it('calculates correct MultiplierFactorNumeric for item discount', () => {
    // Item: qty=2, valorUnitario=100, so baseAmount=200
    // Discount: 20 → factor = 20/200 = 0.10 (10%)
    const discountedItem: XmlInvoiceItem = {
      ...item,
      descuento: 20,
      valorVenta: 180,
    };
    const xml = builder.build(makeInvoiceData({
      items: [discountedItem],
      opGravadas: 180,
      igv: 32.40,
      totalVenta: 212.40,
    }));
    expect(xml).toContain('MultiplierFactorNumeric');
    expect(xml).toContain('0.10000');
    expect(xml).toContain('AllowanceChargeReasonCode');
  });

  it('includes AllowanceCharge for descuentoGlobal', () => {
    const xml = builder.build(makeInvoiceData({ descuentoGlobal: 10 }));
    expect(xml).toContain('AllowanceCharge');
    expect(xml).toContain('ChargeIndicator');
  });

  it('works for Boleta (03)', () => {
    const xml = builder.build(makeInvoiceData({ tipoDoc: '03', serie: 'B001' }));
    const parsed = parseXml(xml);
    expect(parsed.Invoice.InvoiceTypeCode['#text']).toBe('03');
    expect(parsed.Invoice.ID).toBe('B001-00000001');
  });
});

// ═══════════════════════════════════════════════
// CreditNote Builder (07)
// ═══════════════════════════════════════════════

describe('CreditNoteBuilder', () => {
  const builder = new CreditNoteBuilder();

  function makeCreditNoteData(overrides: Partial<XmlCreditNoteData> = {}): XmlCreditNoteData {
    return {
      serie: 'FC01',
      correlativo: 1,
      fechaEmision: '2026-02-23',
      moneda: 'PEN',
      docRefTipo: '01',
      docRefSerie: 'F001',
      docRefCorrelativo: 1,
      motivoNota: '01',
      motivoDescripcion: 'Anulacion de la operacion',
      company,
      client,
      items: [item],
      opGravadas: 200,
      opExoneradas: 0,
      opInafectas: 0,
      opGratuitas: 0,
      igv: 36,
      isc: 0,
      icbper: 0,
      totalVenta: 236,
      montoEnLetras: 'DOSCIENTOS TREINTA Y SEIS CON 00/100 SOLES',
      ...overrides,
    };
  }

  it('generates valid XML with CreditNote root', () => {
    const xml = builder.build(makeCreditNoteData());
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('CreditNote');
  });

  it('uses CreditNote namespace', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2');
  });

  it('includes DiscrepancyResponse with motivo', () => {
    const xml = builder.build(makeCreditNoteData());
    const parsed = parseXml(xml);
    const discrepancy = parsed.CreditNote.DiscrepancyResponse;
    expect(discrepancy.ReferenceID).toBe('F001-00000001');
    expect(discrepancy.ResponseCode['#text']).toBe('01');
    expect(discrepancy.Description).toBe('Anulacion de la operacion');
  });

  it('includes BillingReference to the original document', () => {
    const xml = builder.build(makeCreditNoteData());
    const parsed = parseXml(xml);
    const billing = parsed.CreditNote.BillingReference.InvoiceDocumentReference;
    expect(billing.ID).toBe('F001-00000001');
    expect(billing.DocumentTypeCode['#text']).toBe('01');
  });

  it('uses CreditNoteLine and CreditedQuantity', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('CreditNoteLine');
    expect(xml).toContain('CreditedQuantity');
    expect(xml).not.toContain('InvoiceLine');
  });

  it('references catalogo09 for nota credito motivo', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('catalogo09');
  });
});

// ═══════════════════════════════════════════════
// DebitNote Builder (08)
// ═══════════════════════════════════════════════

describe('DebitNoteBuilder', () => {
  const builder = new DebitNoteBuilder();

  function makeDebitNoteData(overrides: Partial<XmlDebitNoteData> = {}): XmlDebitNoteData {
    return {
      serie: 'FD01',
      correlativo: 1,
      fechaEmision: '2026-02-23',
      moneda: 'PEN',
      docRefTipo: '01',
      docRefSerie: 'F001',
      docRefCorrelativo: 1,
      motivoNota: '01',
      motivoDescripcion: 'Intereses por mora',
      company,
      client,
      items: [item],
      opGravadas: 200,
      opExoneradas: 0,
      opInafectas: 0,
      opGratuitas: 0,
      igv: 36,
      isc: 0,
      icbper: 0,
      totalVenta: 236,
      montoEnLetras: 'DOSCIENTOS TREINTA Y SEIS CON 00/100 SOLES',
      ...overrides,
    };
  }

  it('generates valid XML with DebitNote root', () => {
    const xml = builder.build(makeDebitNoteData());
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('DebitNote');
  });

  it('uses DebitNote namespace', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2');
  });

  it('includes DiscrepancyResponse with motivo', () => {
    const xml = builder.build(makeDebitNoteData());
    const parsed = parseXml(xml);
    const discrepancy = parsed.DebitNote.DiscrepancyResponse;
    expect(discrepancy.ResponseCode['#text']).toBe('01');
    expect(discrepancy.Description).toBe('Intereses por mora');
  });

  it('uses DebitNoteLine and DebitedQuantity', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('DebitNoteLine');
    expect(xml).toContain('DebitedQuantity');
  });

  it('uses RequestedMonetaryTotal (not LegalMonetaryTotal)', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('RequestedMonetaryTotal');
    expect(xml).not.toContain('LegalMonetaryTotal');
  });

  it('references catalogo10 for nota debito motivo', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('catalogo10');
  });
});

// ═══════════════════════════════════════════════
// Summary Builder (Resumen Diario RC)
// ═══════════════════════════════════════════════

describe('SummaryBuilder', () => {
  const builder = new SummaryBuilder();

  function makeSummaryData(overrides: Partial<XmlSummaryData> = {}): XmlSummaryData {
    return {
      correlativo: 1,
      fechaReferencia: '2026-02-22',
      fechaEmision: '2026-02-23',
      company,
      items: [
        {
          tipoDoc: '03',
          serie: 'B001',
          correlativo: 1,
          clienteTipoDoc: '1',
          clienteNumDoc: '12345678',
          estado: '1' as const,
          moneda: 'PEN',
          totalVenta: 118,
          opGravadas: 100,
          opExoneradas: 0,
          opInafectas: 0,
          opGratuitas: 0,
          otrosCargos: 0,
          igv: 18,
          isc: 0,
          icbper: 0,
        },
      ],
      ...overrides,
    };
  }

  it('generates valid XML with SummaryDocuments root', () => {
    const xml = builder.build(makeSummaryData());
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('SummaryDocuments');
  });

  it('uses SUNAT Summary namespace', () => {
    const xml = builder.build(makeSummaryData());
    expect(xml).toContain('urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1');
  });

  it('sets UBLVersionID=2.0 and CustomizationID=1.1', () => {
    const xml = builder.build(makeSummaryData());
    const parsed = parseXml(xml);
    const doc = parsed.SummaryDocuments;
    expect(doc.UBLVersionID).toBe('2.0');
    expect(doc.CustomizationID).toBe('1.1');
  });

  it('formats ID as RC-YYYYMMDD-NNNNN', () => {
    const xml = builder.build(makeSummaryData({ correlativo: 3 }));
    const parsed = parseXml(xml);
    expect(parsed.SummaryDocuments.ID).toBe('RC-20260223-00003');
  });

  it('includes ReferenceDate and IssueDate', () => {
    const xml = builder.build(makeSummaryData());
    const parsed = parseXml(xml);
    expect(parsed.SummaryDocuments.ReferenceDate).toBe('2026-02-22');
    expect(parsed.SummaryDocuments.IssueDate).toBe('2026-02-23');
  });

  it('includes SummaryDocumentsLine with correct structure', () => {
    const xml = builder.build(makeSummaryData());
    expect(xml).toContain('SummaryDocumentsLine');
    expect(xml).toContain('DocumentTypeCode');
    expect(xml).toContain('ConditionCode');
  });

  it('includes BillingPayment for gravadas', () => {
    const xml = builder.build(makeSummaryData());
    expect(xml).toContain('BillingPayment');
    expect(xml).toContain('PaidAmount');
    expect(xml).toContain('InstructionID');
  });

  it('does not include AllowanceCharge when otrosCargos = 0', () => {
    const xml = builder.build(makeSummaryData());
    expect(xml).not.toContain('AllowanceCharge');
  });

  it('includes AllowanceCharge when otrosCargos > 0', () => {
    const data = makeSummaryData();
    data.items[0]!.otrosCargos = 5;
    const xml = builder.build(data);
    expect(xml).toContain('AllowanceCharge');
    expect(xml).toContain('ChargeIndicator');
  });

  it('includes BillingReference for nota items', () => {
    const data = makeSummaryData();
    data.items[0]!.docRefTipo = '03';
    data.items[0]!.docRefSerie = 'B001';
    data.items[0]!.docRefCorrelativo = 5;
    const xml = builder.build(data);
    expect(xml).toContain('BillingReference');
    expect(xml).toContain('InvoiceDocumentReference');
  });
});

// ═══════════════════════════════════════════════
// Voided Builder (Comunicación de Baja RA)
// ═══════════════════════════════════════════════

describe('VoidedBuilder', () => {
  const builder = new VoidedBuilder();

  function makeVoidedData(overrides: Partial<XmlVoidedData> = {}): XmlVoidedData {
    return {
      correlativo: 1,
      fechaReferencia: '2026-02-22',
      fechaEmision: '2026-02-23',
      company,
      items: [
        {
          tipoDoc: '01',
          serie: 'F001',
          correlativo: 5,
          motivo: 'Error en emision',
        },
      ],
      ...overrides,
    };
  }

  it('generates valid XML with VoidedDocuments root', () => {
    const xml = builder.build(makeVoidedData());
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('VoidedDocuments');
  });

  it('uses SUNAT Voided namespace', () => {
    const xml = builder.build(makeVoidedData());
    expect(xml).toContain('urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1');
  });

  it('sets UBLVersionID=2.0 and CustomizationID=1.0', () => {
    const xml = builder.build(makeVoidedData());
    const parsed = parseXml(xml);
    const doc = parsed.VoidedDocuments;
    expect(doc.UBLVersionID).toBe('2.0');
    expect(doc.CustomizationID).toBe('1.0');
  });

  it('formats ID as RA-YYYYMMDD-NNNNN', () => {
    const xml = builder.build(makeVoidedData({ correlativo: 7 }));
    const parsed = parseXml(xml);
    expect(parsed.VoidedDocuments.ID).toBe('RA-20260223-00007');
  });

  it('includes VoidedDocumentsLine with document details', () => {
    const xml = builder.build(makeVoidedData());
    expect(xml).toContain('VoidedDocumentsLine');
    expect(xml).toContain('DocumentTypeCode');
    expect(xml).toContain('DocumentSerialID');
    expect(xml).toContain('DocumentNumberID');
    expect(xml).toContain('VoidReasonDescription');
  });

  it('includes correct void reason', () => {
    const xml = builder.build(makeVoidedData());
    expect(xml).toContain('Error en emision');
  });

  it('handles multiple voided lines', () => {
    const data = makeVoidedData({
      items: [
        { tipoDoc: '01', serie: 'F001', correlativo: 5, motivo: 'Error 1' },
        { tipoDoc: '01', serie: 'F001', correlativo: 6, motivo: 'Error 2' },
        { tipoDoc: '03', serie: 'B001', correlativo: 1, motivo: 'Error 3' },
      ],
    });
    const xml = builder.build(data);
    // Should have 3 VoidedDocumentsLine elements (LineID 1,2,3)
    const matches = xml.match(/VoidedDocumentsLine/g);
    // Opening + closing tags = 2 per line = 6
    expect(matches).toHaveLength(6);
  });
});
