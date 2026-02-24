import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { InvoiceBuilder } from '../invoice.builder.js';
import type {
  XmlInvoiceData,
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

// ═══════════════════════════════════════════════
// Detraccion in XML
// ═══════════════════════════════════════════════

describe('InvoiceBuilder — Detraccion (SPOT)', () => {
  const detraccionData = makeInvoiceData({
    tipoOperacion: '1001',
    totalVenta: 1180,
    opGravadas: 1000,
    igv: 180,
    items: [{
      ...item,
      cantidad: 10,
      valorVenta: 1000,
      precioUnitario: 118,
      igv: 180,
    }],
    detraccion: {
      codigo: '037',
      porcentaje: 0.12,
      monto: 141.60,
      cuentaBN: '00-000-123456',
      medioPago: '001',
    },
  });

  it('contains PaymentMeans element when detraccion is provided', () => {
    const xml = builder.build(detraccionData);
    expect(xml).toContain('PaymentMeans');
    expect(xml).toContain('PaymentMeansCode');
  });

  it('contains Detraccion in PaymentTerms', () => {
    const xml = builder.build(detraccionData);
    expect(xml).toContain('Detraccion');
  });

  it('contains the detraccion code (037)', () => {
    const xml = builder.build(detraccionData);
    // The detraccion code is in PaymentTerms -> PaymentMeansID
    expect(xml).toContain('037');
  });

  it('contains the Banco de la Nacion account', () => {
    const xml = builder.build(detraccionData);
    expect(xml).toContain('00-000-123456');
    expect(xml).toContain('PayeeFinancialAccount');
  });

  it('contains leyenda 2006 for detraccion', () => {
    const xml = builder.build(detraccionData);
    expect(xml).toContain('languageLocaleID="2006"');
    expect(xml).toContain('Obligaciones Tributarias');
  });

  it('contains detraccion percentage', () => {
    const xml = builder.build(detraccionData);
    expect(xml).toContain('PaymentPercent');
    expect(xml).toContain('12.00');
  });

  it('contains detraccion amount', () => {
    const xml = builder.build(detraccionData);
    expect(xml).toContain('141.60');
  });

  it('does NOT contain PaymentMeans element when detraccion is absent', () => {
    const xml = builder.build(makeInvoiceData());
    // PaymentMeansID appears in PaymentTerms (Contado), so check for the
    // specific element <cac:PaymentMeans> and not the substring
    expect(xml).not.toContain('cac:PaymentMeans');
    expect(xml).not.toContain('PayeeFinancialAccount');
    expect(xml).not.toContain('languageLocaleID="2006"');
  });
});

// ═══════════════════════════════════════════════
// Anticipos in XML
// ═══════════════════════════════════════════════

describe('InvoiceBuilder — Anticipos (PrepaidPayment)', () => {
  const anticipoData = makeInvoiceData({
    anticipos: [
      {
        tipoDoc: '02',
        serie: 'F001',
        correlativo: 5,
        moneda: 'PEN',
        monto: 100,
        fechaPago: '2026-01-15',
      },
      {
        tipoDoc: '03',
        serie: 'B001',
        correlativo: 10,
        moneda: 'PEN',
        monto: 50,
        fechaPago: '2026-01-20',
      },
    ],
  });

  it('contains PrepaidPayment section when anticipos are provided', () => {
    const xml = builder.build(anticipoData);
    expect(xml).toContain('PrepaidPayment');
  });

  it('contains the anticipo document reference ID', () => {
    const xml = builder.build(anticipoData);
    expect(xml).toContain('02-F001-5');
    expect(xml).toContain('03-B001-10');
  });

  it('contains the anticipo amount (PaidAmount)', () => {
    const xml = builder.build(anticipoData);
    expect(xml).toContain('PaidAmount');
    expect(xml).toContain('100.00');
    expect(xml).toContain('50.00');
  });

  it('contains the anticipo payment date (PaidDate)', () => {
    const xml = builder.build(anticipoData);
    expect(xml).toContain('PaidDate');
    expect(xml).toContain('2026-01-15');
    expect(xml).toContain('2026-01-20');
  });

  it('generates one PrepaidPayment per anticipo', () => {
    const xml = builder.build(anticipoData);
    // Opening + closing tags = 2 per PrepaidPayment, 2 anticipos = 4
    const matches = xml.match(/PrepaidPayment/g);
    expect(matches).toHaveLength(4);
  });

  it('does NOT contain PrepaidPayment when anticipos are absent', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).not.toContain('PrepaidPayment');
  });

  it('does NOT contain PrepaidPayment when anticipos array is empty', () => {
    const xml = builder.build(makeInvoiceData({ anticipos: [] }));
    expect(xml).not.toContain('PrepaidPayment');
  });
});

// ═══════════════════════════════════════════════
// Export in XML — TaxScheme 9995
// ═══════════════════════════════════════════════

describe('InvoiceBuilder — Export (opExportacion)', () => {
  const exportItem: XmlInvoiceItem = {
    cantidad: 5,
    unidadMedida: 'NIU',
    descripcion: 'Export product',
    codigo: 'EXP001',
    valorUnitario: 200,
    precioUnitario: 200,
    valorVenta: 1000,
    tipoAfectacion: '40',
    igv: 0,
    isc: 0,
    icbper: 0,
    descuento: 0,
  };

  const exportData = makeInvoiceData({
    tipoOperacion: '0200',
    opGravadas: 0,
    opExoneradas: 0,
    opInafectas: 0,
    opExportacion: 1000,
    igv: 0,
    totalVenta: 1000,
    items: [exportItem],
    montoEnLetras: 'MIL CON 00/100 SOLES',
  });

  it('contains TaxScheme/ID with value 9995 for export', () => {
    const xml = builder.build(exportData);
    expect(xml).toContain('>9995<');
  });

  it('contains export tax scheme name EXP', () => {
    const xml = builder.build(exportData);
    expect(xml).toContain('>EXP<');
  });

  it('contains export tax category G', () => {
    const xml = builder.build(exportData);
    expect(xml).toContain('>G<');
  });

  it('does NOT contain 9995 when opExportacion is 0', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).not.toContain('>9995<');
  });
});

// ═══════════════════════════════════════════════
// IVAP in XML — leyenda 2007
// ═══════════════════════════════════════════════

describe('InvoiceBuilder — IVAP (opIvap)', () => {
  const ivapItem: XmlInvoiceItem = {
    cantidad: 10,
    unidadMedida: 'KGM',
    descripcion: 'Arroz Pilado',
    codigo: 'ARROZ001',
    valorUnitario: 50,
    precioUnitario: 52,
    valorVenta: 500,
    tipoAfectacion: '17',
    igv: 20,
    isc: 0,
    icbper: 0,
    descuento: 0,
  };

  const ivapData = makeInvoiceData({
    opGravadas: 0,
    igv: 0,
    opIvap: 500,
    igvIvap: 20,
    totalVenta: 520,
    items: [ivapItem],
    montoEnLetras: 'QUINIENTOS VEINTE CON 00/100 SOLES',
  });

  it('contains leyenda 2007 for IVAP', () => {
    const xml = builder.build(ivapData);
    expect(xml).toContain('languageLocaleID="2007"');
    expect(xml).toContain('Arroz Pilado');
  });

  it('contains TaxScheme code 1016 for IVAP', () => {
    const xml = builder.build(ivapData);
    expect(xml).toContain('>1016<');
  });

  it('contains IVAP tax scheme name', () => {
    const xml = builder.build(ivapData);
    expect(xml).toContain('>IVAP<');
  });

  it('does NOT contain leyenda 2007 when opIvap is 0', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).not.toContain('languageLocaleID="2007"');
  });

  it('does NOT contain 1016 when opIvap is 0', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).not.toContain('>1016<');
  });
});

// ═══════════════════════════════════════════════
// Credito payment terms with cuotas
// ═══════════════════════════════════════════════

describe('InvoiceBuilder — Credito payment terms', () => {
  const creditoData = makeInvoiceData({
    formaPago: {
      formaPago: 'Credito',
      cuotas: [
        { monto: 100, moneda: 'PEN', fechaPago: '2026-03-15' },
        { monto: 136, moneda: 'PEN', fechaPago: '2026-04-15' },
      ],
    },
  });

  it('contains Credito in PaymentTerms', () => {
    const xml = builder.build(creditoData);
    expect(xml).toContain('Credito');
  });

  it('contains Cuota001 and Cuota002', () => {
    const xml = builder.build(creditoData);
    expect(xml).toContain('Cuota001');
    expect(xml).toContain('Cuota002');
  });

  it('contains cuota amounts', () => {
    const xml = builder.build(creditoData);
    expect(xml).toContain('100.00');
    expect(xml).toContain('136.00');
  });

  it('contains cuota due dates', () => {
    const xml = builder.build(creditoData);
    expect(xml).toContain('PaymentDueDate');
    expect(xml).toContain('2026-03-15');
    expect(xml).toContain('2026-04-15');
  });

  it('contains total amount in credit FormaPago', () => {
    const xml = builder.build(creditoData);
    const parsed = parseXml(xml);
    // PaymentTerms is an array: first is FormaPago, then cuotas
    const terms = parsed.Invoice.PaymentTerms;
    // The first PaymentTerms should be the FormaPago block with Amount = totalVenta
    const formaPagoBlock = Array.isArray(terms) ? terms[0] : terms;
    expect(formaPagoBlock.PaymentMeansID).toBe('Credito');
    expect(formaPagoBlock.Amount['#text']).toBe('236.00');
  });

  it('generates correct cuota numbering (padded to 3 digits)', () => {
    const xml = builder.build(creditoData);
    // Cuota001, Cuota002 — padded to 3 digits
    expect(xml).toContain('Cuota001');
    expect(xml).toContain('Cuota002');
    expect(xml).not.toContain('Cuota1');
  });
});

// ═══════════════════════════════════════════════
// Documentos Relacionados
// ═══════════════════════════════════════════════

describe('InvoiceBuilder — Documentos Relacionados', () => {
  it('includes AdditionalDocumentReference when documentosRelacionados present', () => {
    const xml = builder.build(makeInvoiceData({
      documentosRelacionados: [
        { tipoDoc: '01', numero: 'F001-00000010' },
      ],
    }));
    expect(xml).toContain('AdditionalDocumentReference');
    expect(xml).toContain('F001-00000010');
    expect(xml).toContain('DocumentTypeCode');
  });

  it('does NOT include AdditionalDocumentReference when absent', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).not.toContain('AdditionalDocumentReference');
  });
});

// ═══════════════════════════════════════════════
// OrderReference (contingencia)
// ═══════════════════════════════════════════════

describe('InvoiceBuilder — OrderReference (contingencia)', () => {
  it('includes OrderReference when orderReferenceId is set', () => {
    const xml = builder.build(makeInvoiceData({ orderReferenceId: 'DOC-CONTINGENCIA-001' }));
    expect(xml).toContain('OrderReference');
    expect(xml).toContain('DOC-CONTINGENCIA-001');
  });

  it('does NOT include OrderReference when absent', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).not.toContain('OrderReference');
  });
});

// ═══════════════════════════════════════════════
// ICBPER leyenda 2010
// ═══════════════════════════════════════════════

describe('InvoiceBuilder — ICBPER leyenda', () => {
  it('includes leyenda 2010 when icbper > 0', () => {
    const icbperItem: XmlInvoiceItem = {
      ...item,
      icbper: 1.00,
    };
    const xml = builder.build(makeInvoiceData({
      icbper: 1.00,
      items: [icbperItem],
      totalVenta: 237,
    }));
    expect(xml).toContain('languageLocaleID="2010"');
    expect(xml).toContain('Bolsas de');
  });

  it('does NOT include leyenda 2010 when icbper is 0', () => {
    const xml = builder.build(makeInvoiceData());
    expect(xml).not.toContain('languageLocaleID="2010"');
  });
});
