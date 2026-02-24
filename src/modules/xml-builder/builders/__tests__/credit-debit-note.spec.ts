import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { CreditNoteBuilder } from '../credit-note.builder.js';
import { DebitNoteBuilder } from '../debit-note.builder.js';
import type {
  XmlCreditNoteData,
  XmlDebitNoteData,
  XmlCompany,
  XmlClient,
  XmlInvoiceItem,
} from '../../interfaces/xml-builder.interfaces.js';

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

function parseXml(xml: string): any {
  return parser.parse(xml);
}

// ═══════════════════════════════════════════════
// Credit Note Builder (07)
// ═══════════════════════════════════════════════

describe('CreditNoteBuilder — detailed tests', () => {
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

  // ─── Basic generation ───

  it('generates valid XML with CreditNote root element', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('CreditNote');
  });

  it('uses CreditNote UBL namespace', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2');
  });

  it('contains the motivoNota code in DiscrepancyResponse', () => {
    const xml = builder.build(makeCreditNoteData({ motivoNota: '06' }));
    const parsed = parseXml(xml);
    const discrepancy = parsed.CreditNote.DiscrepancyResponse;
    expect(discrepancy.ResponseCode['#text']).toBe('06');
  });

  it('contains the reference document in BillingReference', () => {
    const xml = builder.build(makeCreditNoteData({
      docRefTipo: '03',
      docRefSerie: 'B001',
      docRefCorrelativo: 42,
    }));
    const parsed = parseXml(xml);
    const billing = parsed.CreditNote.BillingReference.InvoiceDocumentReference;
    expect(billing.ID).toBe('B001-00000042');
    expect(billing.DocumentTypeCode['#text']).toBe('03');
  });

  it('references catalogo09 for credit note motivo', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('catalogo09');
  });

  it('uses CreditNoteLine and CreditedQuantity elements', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('CreditNoteLine');
    expect(xml).toContain('CreditedQuantity');
    expect(xml).not.toContain('InvoiceLine');
    expect(xml).not.toContain('InvoicedQuantity');
  });

  it('uses LegalMonetaryTotal (not RequestedMonetaryTotal)', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('LegalMonetaryTotal');
    expect(xml).not.toContain('RequestedMonetaryTotal');
  });

  // ─── Motivo variations ───

  it('generates correct XML for motivo 04 (descuento global)', () => {
    const xml = builder.build(makeCreditNoteData({
      motivoNota: '04',
      motivoDescripcion: 'Descuento global',
    }));
    const parsed = parseXml(xml);
    expect(parsed.CreditNote.DiscrepancyResponse.ResponseCode['#text']).toBe('04');
    expect(parsed.CreditNote.DiscrepancyResponse.Description).toBe('Descuento global');
  });

  it('generates correct XML for motivo 13 (correccion error monto)', () => {
    const xml = builder.build(makeCreditNoteData({
      motivoNota: '13',
      motivoDescripcion: 'Correccion de monto',
    }));
    const parsed = parseXml(xml);
    expect(parsed.CreditNote.DiscrepancyResponse.ResponseCode['#text']).toBe('13');
  });

  // ─── Document structure ───

  it('formats document ID correctly', () => {
    const xml = builder.build(makeCreditNoteData({ correlativo: 99 }));
    const parsed = parseXml(xml);
    expect(parsed.CreditNote.ID).toBe('FC01-00000099');
  });

  it('sets UBLVersionID=2.1 and CustomizationID=2.0', () => {
    const xml = builder.build(makeCreditNoteData());
    const parsed = parseXml(xml);
    expect(parsed.CreditNote.UBLVersionID).toBe('2.1');
    expect(parsed.CreditNote.CustomizationID).toBe('2.0');
  });

  it('includes UBLExtensions for signature placeholder', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('UBLExtensions');
    expect(xml).toContain('ExtensionContent');
  });

  it('includes supplier and customer parties', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('AccountingSupplierParty');
    expect(xml).toContain('AccountingCustomerParty');
    expect(xml).toContain('20000000001'); // RUC
    expect(xml).toContain('CLIENTE TEST SRL');
  });

  it('includes TaxTotal with correct IGV amount', () => {
    const xml = builder.build(makeCreditNoteData());
    const parsed = parseXml(xml);
    const taxTotal = parsed.CreditNote.TaxTotal;
    expect(taxTotal.TaxAmount['#text']).toBe('36.00');
  });

  it('includes LegalMonetaryTotal with correct amounts', () => {
    const xml = builder.build(makeCreditNoteData());
    const parsed = parseXml(xml);
    const totals = parsed.CreditNote.LegalMonetaryTotal;
    expect(totals.LineExtensionAmount['#text']).toBe('200.00');
    expect(totals.PayableAmount['#text']).toBe('236.00');
  });

  it('includes legend with monto en letras', () => {
    const xml = builder.build(makeCreditNoteData());
    expect(xml).toContain('languageLocaleID="1000"');
    expect(xml).toContain('DOSCIENTOS TREINTA Y SEIS');
  });

  it('includes LineCountNumeric', () => {
    const xml = builder.build(makeCreditNoteData({ items: [item, item] }));
    const parsed = parseXml(xml);
    expect(parsed.CreditNote.LineCountNumeric).toBe('2');
  });

  // ─── Multiple items ───

  it('handles multiple line items correctly', () => {
    const items: XmlInvoiceItem[] = [
      { ...item, descripcion: 'Item 1', valorVenta: 100, igv: 18 },
      { ...item, descripcion: 'Item 2', valorVenta: 100, igv: 18 },
    ];
    const xml = builder.build(makeCreditNoteData({ items }));
    const parsed = parseXml(xml);
    const lines = parsed.CreditNote.CreditNoteLine;
    expect(Array.isArray(lines)).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[0].ID).toBe('1');
    expect(lines[1].ID).toBe('2');
  });

  // ─── Reference with different correlativo ───

  it('correctly formats reference document ID with large correlativo', () => {
    const xml = builder.build(makeCreditNoteData({
      docRefSerie: 'F002',
      docRefCorrelativo: 12345,
    }));
    const parsed = parseXml(xml);
    const billing = parsed.CreditNote.BillingReference.InvoiceDocumentReference;
    expect(billing.ID).toBe('F002-00012345');
  });

  // ─── IVAP support ───

  it('includes IVAP TaxSubtotal when opIvap > 0', () => {
    const xml = builder.build(makeCreditNoteData({
      opGravadas: 0,
      igv: 0,
      opIvap: 500,
      igvIvap: 20,
      totalVenta: 520,
    }));
    expect(xml).toContain('>1016<');
    expect(xml).toContain('>IVAP<');
  });
});

// ═══════════════════════════════════════════════
// Debit Note Builder (08)
// ═══════════════════════════════════════════════

describe('DebitNoteBuilder — detailed tests', () => {
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

  // ─── Basic generation ───

  it('generates valid XML with DebitNote root element', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('DebitNote');
  });

  it('uses DebitNote UBL namespace', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2');
  });

  it('contains the motivoNota code in DiscrepancyResponse', () => {
    const xml = builder.build(makeDebitNoteData({ motivoNota: '02' }));
    const parsed = parseXml(xml);
    const discrepancy = parsed.DebitNote.DiscrepancyResponse;
    expect(discrepancy.ResponseCode['#text']).toBe('02');
  });

  it('contains the motivo description in DiscrepancyResponse', () => {
    const xml = builder.build(makeDebitNoteData({
      motivoNota: '03',
      motivoDescripcion: 'Penalidades por incumplimiento',
    }));
    const parsed = parseXml(xml);
    expect(parsed.DebitNote.DiscrepancyResponse.Description).toBe('Penalidades por incumplimiento');
  });

  it('contains the reference document in BillingReference', () => {
    const xml = builder.build(makeDebitNoteData({
      docRefTipo: '01',
      docRefSerie: 'F001',
      docRefCorrelativo: 7,
    }));
    const parsed = parseXml(xml);
    const billing = parsed.DebitNote.BillingReference.InvoiceDocumentReference;
    expect(billing.ID).toBe('F001-00000007');
    expect(billing.DocumentTypeCode['#text']).toBe('01');
  });

  it('references catalogo10 for debit note motivo', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('catalogo10');
  });

  it('uses DebitNoteLine and DebitedQuantity elements', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('DebitNoteLine');
    expect(xml).toContain('DebitedQuantity');
    expect(xml).not.toContain('InvoiceLine');
    expect(xml).not.toContain('InvoicedQuantity');
  });

  it('uses RequestedMonetaryTotal (not LegalMonetaryTotal)', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('RequestedMonetaryTotal');
    expect(xml).not.toContain('LegalMonetaryTotal');
  });

  // ─── Motivo variations ───

  it('generates correct XML for motivo 01 (intereses por mora)', () => {
    const xml = builder.build(makeDebitNoteData({
      motivoNota: '01',
      motivoDescripcion: 'Intereses por mora',
    }));
    const parsed = parseXml(xml);
    expect(parsed.DebitNote.DiscrepancyResponse.ResponseCode['#text']).toBe('01');
  });

  it('generates correct XML for motivo 02 (aumento de valor)', () => {
    const xml = builder.build(makeDebitNoteData({
      motivoNota: '02',
      motivoDescripcion: 'Aumento en el valor de la operacion',
    }));
    const parsed = parseXml(xml);
    expect(parsed.DebitNote.DiscrepancyResponse.ResponseCode['#text']).toBe('02');
  });

  it('generates correct XML for motivo 03 (penalidades)', () => {
    const xml = builder.build(makeDebitNoteData({
      motivoNota: '03',
      motivoDescripcion: 'Penalidades',
    }));
    const parsed = parseXml(xml);
    expect(parsed.DebitNote.DiscrepancyResponse.ResponseCode['#text']).toBe('03');
  });

  it('generates correct XML for motivo 11 (otros)', () => {
    const xml = builder.build(makeDebitNoteData({
      motivoNota: '11',
      motivoDescripcion: 'Ajuste por otros conceptos',
    }));
    const parsed = parseXml(xml);
    expect(parsed.DebitNote.DiscrepancyResponse.ResponseCode['#text']).toBe('11');
  });

  // ─── Document structure ───

  it('formats document ID correctly', () => {
    const xml = builder.build(makeDebitNoteData({ correlativo: 123 }));
    const parsed = parseXml(xml);
    expect(parsed.DebitNote.ID).toBe('FD01-00000123');
  });

  it('sets UBLVersionID=2.1 and CustomizationID=2.0', () => {
    const xml = builder.build(makeDebitNoteData());
    const parsed = parseXml(xml);
    expect(parsed.DebitNote.UBLVersionID).toBe('2.1');
    expect(parsed.DebitNote.CustomizationID).toBe('2.0');
  });

  it('includes UBLExtensions for signature placeholder', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('UBLExtensions');
    expect(xml).toContain('ExtensionContent');
  });

  it('includes supplier and customer parties', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('AccountingSupplierParty');
    expect(xml).toContain('AccountingCustomerParty');
    expect(xml).toContain('EMPRESA TEST SAC');
    expect(xml).toContain('CLIENTE TEST SRL');
  });

  it('includes TaxTotal with correct IGV amount', () => {
    const xml = builder.build(makeDebitNoteData());
    const parsed = parseXml(xml);
    const taxTotal = parsed.DebitNote.TaxTotal;
    expect(taxTotal.TaxAmount['#text']).toBe('36.00');
  });

  it('includes RequestedMonetaryTotal with correct amounts', () => {
    const xml = builder.build(makeDebitNoteData());
    const parsed = parseXml(xml);
    const totals = parsed.DebitNote.RequestedMonetaryTotal;
    expect(totals.LineExtensionAmount['#text']).toBe('200.00');
    expect(totals.PayableAmount['#text']).toBe('236.00');
  });

  it('includes legend with monto en letras', () => {
    const xml = builder.build(makeDebitNoteData());
    expect(xml).toContain('languageLocaleID="1000"');
    expect(xml).toContain('DOSCIENTOS TREINTA Y SEIS');
  });

  it('includes LineCountNumeric', () => {
    const xml = builder.build(makeDebitNoteData());
    const parsed = parseXml(xml);
    expect(parsed.DebitNote.LineCountNumeric).toBe('1');
  });

  // ─── Boleta reference ───

  it('correctly references a Boleta (03) document', () => {
    const xml = builder.build(makeDebitNoteData({
      docRefTipo: '03',
      docRefSerie: 'B001',
      docRefCorrelativo: 55,
    }));
    const parsed = parseXml(xml);
    const billing = parsed.DebitNote.BillingReference.InvoiceDocumentReference;
    expect(billing.ID).toBe('B001-00000055');
    expect(billing.DocumentTypeCode['#text']).toBe('03');
  });

  // ─── Multiple items ───

  it('handles multiple line items correctly', () => {
    const items: XmlInvoiceItem[] = [
      { ...item, descripcion: 'Interest item 1', valorVenta: 100, igv: 18 },
      { ...item, descripcion: 'Interest item 2', valorVenta: 100, igv: 18 },
    ];
    const xml = builder.build(makeDebitNoteData({ items }));
    const parsed = parseXml(xml);
    const lines = parsed.DebitNote.DebitNoteLine;
    expect(Array.isArray(lines)).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[0].ID).toBe('1');
    expect(lines[1].ID).toBe('2');
  });

  // ─── IVAP support ───

  it('includes IVAP TaxSubtotal when opIvap > 0', () => {
    const xml = builder.build(makeDebitNoteData({
      opGravadas: 0,
      igv: 0,
      opIvap: 500,
      igvIvap: 20,
      totalVenta: 520,
    }));
    expect(xml).toContain('>1016<');
    expect(xml).toContain('>IVAP<');
  });

  // ─── Exonerado and Inafecto ───

  it('includes exonerado TaxSubtotal when opExoneradas > 0', () => {
    const exoItem: XmlInvoiceItem = {
      ...item,
      tipoAfectacion: '20',
      igv: 0,
      precioUnitario: 100,
    };
    const xml = builder.build(makeDebitNoteData({
      opGravadas: 0,
      igv: 0,
      opExoneradas: 200,
      totalVenta: 200,
      items: [exoItem],
    }));
    expect(xml).toContain('>9997<'); // EXONERADO code
    expect(xml).toContain('>EXO<');
  });

  it('includes inafecto TaxSubtotal when opInafectas > 0', () => {
    const inaItem: XmlInvoiceItem = {
      ...item,
      tipoAfectacion: '30',
      igv: 0,
      precioUnitario: 100,
    };
    const xml = builder.build(makeDebitNoteData({
      opGravadas: 0,
      igv: 0,
      opInafectas: 200,
      totalVenta: 200,
      items: [inaItem],
    }));
    expect(xml).toContain('>9998<'); // INAFECTO code
    expect(xml).toContain('>INA<');
  });
});
