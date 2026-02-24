/**
 * SUNAT Beta Integration Tests
 *
 * Validates that all 9 CPE document types generate valid XML structure
 * that matches SUNAT UBL 2.1 requirements. These tests verify:
 * - Required XML elements and attributes are present
 * - Namespace declarations are correct
 * - Document IDs follow SUNAT format (Serie-Correlativo padded to 8)
 * - Tax totals have correct structure (TaxScheme codes, names)
 * - Payment terms follow SUNAT specification
 * - All builder outputs are well-formed XML
 *
 * For actual SUNAT beta send tests, use the e2e tests in test/invoices.e2e-spec.ts
 * which require running services (PostgreSQL, Redis, SUNAT beta endpoint).
 */

import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { InvoiceBuilder } from '../invoice.builder.js';
import { CreditNoteBuilder } from '../credit-note.builder.js';
import { DebitNoteBuilder } from '../debit-note.builder.js';
import { SummaryBuilder } from '../summary.builder.js';
import { VoidedBuilder } from '../voided.builder.js';
import { RetentionBuilder } from '../retention.builder.js';
import { PerceptionBuilder } from '../perception.builder.js';
import { GuideBuilder } from '../guide.builder.js';
import type {
  XmlInvoiceData,
  XmlCreditNoteData,
  XmlDebitNoteData,
  XmlSummaryData,
  XmlVoidedData,
  XmlRetentionData,
  XmlPerceptionData,
  XmlGuideData,
  XmlCompany,
  XmlClient,
  XmlInvoiceItem,
} from '../../interfaces/xml-builder.interfaces.js';

// ── Shared fixtures ──

const company: XmlCompany = {
  ruc: '20000000001',
  razonSocial: 'EMPRESA BETA TEST SAC',
  nombreComercial: 'BETA TEST',
  direccion: 'AV. JAVIER PRADO 1234',
  ubigeo: '150101',
  departamento: 'LIMA',
  provincia: 'LIMA',
  distrito: 'LIMA',
  codigoPais: 'PE',
};

const client: XmlClient = {
  tipoDocIdentidad: '6',
  numDocIdentidad: '20100000001',
  nombre: 'CLIENTE BETA SRL',
  direccion: 'JR. CLIENTE 456',
};

const gravadoItem: XmlInvoiceItem = {
  cantidad: 5,
  unidadMedida: 'NIU',
  descripcion: 'Laptop HP ProBook 450',
  codigo: 'LAP001',
  valorUnitario: 2542.37,
  precioUnitario: 3000,
  valorVenta: 12711.86,
  tipoAfectacion: '10',
  igv: 2288.14,
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

// ── FACTURA (01) ──

describe('SUNAT Beta — Factura (01)', () => {
  const builder = new InvoiceBuilder();

  const data: XmlInvoiceData = {
    tipoDoc: '01',
    serie: 'F001',
    correlativo: 1,
    tipoOperacion: '0101',
    fechaEmision: '2026-02-24',
    horaEmision: '12:30:00',
    moneda: 'PEN',
    company,
    client,
    items: [gravadoItem],
    opGravadas: 12711.86,
    opExoneradas: 0,
    opInafectas: 0,
    opGratuitas: 0,
    igv: 2288.14,
    isc: 0,
    icbper: 0,
    otrosCargos: 0,
    descuentoGlobal: 0,
    totalVenta: 15000,
    formaPago: { formaPago: 'Contado' },
    montoEnLetras: 'QUINCE MIL CON 00/100 SOLES',
  };

  it('should generate valid XML with all required SUNAT elements', () => {
    const xml = builder.build(data);
    expect(xml).toContain('<?xml');
    expect(xml).toContain('Invoice');
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');

    const parsed = parseXml(xml);
    const inv = parsed.Invoice;

    // UBL versions
    expect(inv.UBLVersionID).toBe('2.1');
    expect(inv.CustomizationID).toBe('2.0');

    // Document ID: F001-00000001
    expect(inv.ID).toBe('F001-00000001');

    // Dates
    expect(inv.IssueDate).toBe('2026-02-24');
    expect(inv.IssueTime).toBe('12:30:00');

    // Invoice type code = 01
    expect(inv.InvoiceTypeCode['#text']).toBe('01');
    expect(inv.InvoiceTypeCode['@_listID']).toBe('0101');

    // Currency
    expect(inv.DocumentCurrencyCode['#text']).toBe('PEN');
  });

  it('should include correct supplier (company) data', () => {
    const xml = builder.build(data);
    const parsed = parseXml(xml);
    const supplier = parsed.Invoice.AccountingSupplierParty;

    expect(supplier.Party.PartyIdentification.ID['#text']).toBe('20000000001');
    expect(supplier.Party.PartyIdentification.ID['@_schemeID']).toBe('6');
  });

  it('should include correct customer (client) data', () => {
    const xml = builder.build(data);
    const parsed = parseXml(xml);
    const customer = parsed.Invoice.AccountingCustomerParty;

    expect(customer.Party.PartyIdentification.ID['#text']).toBe('20100000001');
    expect(customer.Party.PartyIdentification.ID['@_schemeID']).toBe('6');
  });

  it('should include payment terms (Contado)', () => {
    const xml = builder.build(data);
    const parsed = parseXml(xml);
    const terms = parsed.Invoice.PaymentTerms;

    expect(terms.ID).toBe('FormaPago');
    expect(terms.PaymentMeansID).toBe('Contado');
  });

  it('should include correct tax totals with IGV 1000', () => {
    const xml = builder.build(data);
    const parsed = parseXml(xml);
    const taxTotal = parsed.Invoice.TaxTotal;

    expect(taxTotal.TaxAmount['#text']).toBe('2288.14');
    expect(taxTotal.TaxAmount['@_currencyID']).toBe('PEN');

    // Should have at least one TaxSubtotal with IGV (1000)
    const subtotals = Array.isArray(taxTotal.TaxSubtotal)
      ? taxTotal.TaxSubtotal
      : [taxTotal.TaxSubtotal];

    const igvSubtotal = subtotals.find(
      (s: any) => s.TaxCategory?.TaxScheme?.ID?.['#text'] === '1000',
    );
    expect(igvSubtotal).toBeDefined();
    expect(igvSubtotal.TaxableAmount['#text']).toBe('12711.86');
  });

  it('should include legal monetary total', () => {
    const xml = builder.build(data);
    const parsed = parseXml(xml);
    const total = parsed.Invoice.LegalMonetaryTotal;

    expect(total.PayableAmount['#text']).toBe('15000.00');
    expect(total.PayableAmount['@_currencyID']).toBe('PEN');
  });

  it('should include invoice lines', () => {
    const xml = builder.build(data);
    const parsed = parseXml(xml);
    const line = parsed.Invoice.InvoiceLine;

    expect(line.ID).toBe('1');
    expect(line.InvoicedQuantity['#text']).toBe('5.000');
    expect(line.LineExtensionAmount['#text']).toBe('12711.86');
  });

  it('should include Credito payment terms with cuotas', () => {
    const creditData: XmlInvoiceData = {
      ...data,
      formaPago: {
        formaPago: 'Credito',
        cuotas: [
          { monto: 7500, moneda: 'PEN', fechaPago: '2026-03-24' },
          { monto: 7500, moneda: 'PEN', fechaPago: '2026-04-24' },
        ],
      },
    };

    const xml = builder.build(creditData);
    const parsed = parseXml(xml);
    const terms = Array.isArray(parsed.Invoice.PaymentTerms)
      ? parsed.Invoice.PaymentTerms
      : [parsed.Invoice.PaymentTerms];

    // First PaymentTerms = FormaPago Credito
    expect(terms[0].PaymentMeansID).toBe('Credito');
    // Second = Cuota001
    expect(terms[1].PaymentMeansID).toBe('Cuota001');
    expect(terms[1].Amount['#text']).toBe('7500.00');
    expect(terms[1].PaymentDueDate).toBe('2026-03-24');
  });

  it('should include DespatchDocumentReference when guiaRemision is set', () => {
    const withGuia: XmlInvoiceData = {
      ...data,
      guiaRemision: { serie: 'T001', correlativo: 5 },
    };

    const xml = builder.build(withGuia);
    const parsed = parseXml(xml);
    const ref = parsed.Invoice.DespatchDocumentReference;

    expect(ref).toBeDefined();
    expect(ref.ID).toBe('T001-00000005');
    expect(ref.DocumentTypeCode['#text']).toBe('09');
  });
});

// ── BOLETA (03) ──

describe('SUNAT Beta — Boleta (03)', () => {
  const builder = new InvoiceBuilder();

  it('should generate Boleta XML with type code 03', () => {
    const data: XmlInvoiceData = {
      tipoDoc: '03',
      serie: 'B001',
      correlativo: 1,
      tipoOperacion: '0101',
      fechaEmision: '2026-02-24',
      moneda: 'PEN',
      company,
      client: { ...client, tipoDocIdentidad: '1', numDocIdentidad: '12345678' },
      items: [{ ...gravadoItem, cantidad: 1, valorVenta: 2542.37, igv: 457.63, precioUnitario: 3000 }],
      opGravadas: 2542.37,
      opExoneradas: 0,
      opInafectas: 0,
      opGratuitas: 0,
      igv: 457.63,
      isc: 0,
      icbper: 0,
      otrosCargos: 0,
      descuentoGlobal: 0,
      totalVenta: 3000,
      formaPago: { formaPago: 'Contado' },
      montoEnLetras: 'TRES MIL CON 00/100 SOLES',
    };

    const xml = builder.build(data);
    const parsed = parseXml(xml);

    expect(parsed.Invoice.InvoiceTypeCode['#text']).toBe('03');
    expect(parsed.Invoice.ID).toBe('B001-00000001');
  });
});

// ── NOTA DE CRÉDITO (07) ──

describe('SUNAT Beta — Nota de Crédito (07)', () => {
  const builder = new CreditNoteBuilder();

  it('should generate CreditNote XML with BillingReference', () => {
    const data: XmlCreditNoteData = {
      serie: 'FC01',
      correlativo: 1,
      fechaEmision: '2026-02-24',
      moneda: 'PEN',
      docRefTipo: '01',
      docRefSerie: 'F001',
      docRefCorrelativo: 1,
      motivoNota: '01',
      motivoDescripcion: 'Anulación de la operación',
      company,
      client,
      items: [gravadoItem],
      opGravadas: 12711.86,
      opExoneradas: 0,
      opInafectas: 0,
      opGratuitas: 0,
      igv: 2288.14,
      isc: 0,
      icbper: 0,
      totalVenta: 15000,
      montoEnLetras: 'QUINCE MIL CON 00/100 SOLES',
    };

    const xml = builder.build(data);
    const parsed = parseXml(xml);

    expect(parsed.CreditNote).toBeDefined();
    expect(parsed.CreditNote.ID).toBe('FC01-00000001');

    // BillingReference must reference the original document
    const billingRef = parsed.CreditNote.BillingReference.InvoiceDocumentReference;
    expect(billingRef.ID).toBe('F001-00000001');
    // DocumentTypeCode may have attributes, so check #text
    const dtc = billingRef.DocumentTypeCode;
    expect(typeof dtc === 'object' ? dtc['#text'] : dtc).toBe('01');

    // DiscrepancyResponse (motivo) — ResponseCode has SUNAT attributes
    const discrepancy = parsed.CreditNote.DiscrepancyResponse;
    const rc = discrepancy.ResponseCode;
    expect(typeof rc === 'object' ? rc['#text'] : rc).toBe('01');
  });
});

// ── NOTA DE DÉBITO (08) ──

describe('SUNAT Beta — Nota de Débito (08)', () => {
  const builder = new DebitNoteBuilder();

  it('should generate DebitNote XML with BillingReference', () => {
    const data: XmlDebitNoteData = {
      serie: 'FD01',
      correlativo: 1,
      fechaEmision: '2026-02-24',
      moneda: 'PEN',
      docRefTipo: '01',
      docRefSerie: 'F001',
      docRefCorrelativo: 1,
      motivoNota: '01',
      motivoDescripcion: 'Intereses por mora',
      company,
      client,
      items: [{ ...gravadoItem, cantidad: 1, valorVenta: 100, igv: 18, precioUnitario: 118, valorUnitario: 100 }],
      opGravadas: 100,
      opExoneradas: 0,
      opInafectas: 0,
      opGratuitas: 0,
      igv: 18,
      isc: 0,
      icbper: 0,
      totalVenta: 118,
      montoEnLetras: 'CIENTO DIECIOCHO CON 00/100 SOLES',
    };

    const xml = builder.build(data);
    const parsed = parseXml(xml);

    expect(parsed.DebitNote).toBeDefined();
    expect(parsed.DebitNote.ID).toBe('FD01-00000001');

    const billingRef = parsed.DebitNote.BillingReference.InvoiceDocumentReference;
    expect(billingRef.ID).toBe('F001-00000001');
  });
});

// ── RESUMEN DIARIO (RC) ──

describe('SUNAT Beta — Resumen Diario (RC)', () => {
  const builder = new SummaryBuilder();

  it('should generate SummaryDocuments XML', () => {
    const data: XmlSummaryData = {
      correlativo: 1,
      fechaReferencia: '2026-02-24',
      fechaEmision: '2026-02-24',
      company,
      items: [
        {
          tipoDoc: '03',
          serie: 'B001',
          correlativo: 1,
          clienteTipoDoc: '1',
          clienteNumDoc: '12345678',
          estado: '1',
          moneda: 'PEN',
          totalVenta: 100,
          opGravadas: 84.75,
          opExoneradas: 0,
          opInafectas: 0,
          opGratuitas: 0,
          otrosCargos: 0,
          igv: 15.25,
          isc: 0,
          icbper: 0,
        },
      ],
    };

    const xml = builder.build(data);
    const parsed = parseXml(xml);

    expect(parsed.SummaryDocuments).toBeDefined();
    expect(parsed.SummaryDocuments.ID).toBe('RC-20260224-00001');
    expect(parsed.SummaryDocuments.ReferenceDate).toBe('2026-02-24');
  });
});

// ── COMUNICACIÓN DE BAJA (RA) ──

describe('SUNAT Beta — Comunicación de Baja (RA)', () => {
  const builder = new VoidedBuilder();

  it('should generate VoidedDocuments XML', () => {
    const data: XmlVoidedData = {
      correlativo: 1,
      fechaReferencia: '2026-02-24',
      fechaEmision: '2026-02-24',
      company,
      items: [
        {
          tipoDoc: '01',
          serie: 'F001',
          correlativo: 5,
          motivo: 'Error en los datos del cliente',
        },
      ],
    };

    const xml = builder.build(data);
    const parsed = parseXml(xml);

    expect(parsed.VoidedDocuments).toBeDefined();
    expect(parsed.VoidedDocuments.ID).toBe('RA-20260224-00001');
    expect(parsed.VoidedDocuments.ReferenceDate).toBe('2026-02-24');
  });
});

// ── COMPROBANTE DE RETENCIÓN (20) ──

describe('SUNAT Beta — Retención (20)', () => {
  const builder = new RetentionBuilder();

  it('should generate Retention XML with correct regime and rate', () => {
    const data: XmlRetentionData = {
      serie: 'R001',
      correlativo: 1,
      fechaEmision: '2026-02-24',
      regimenRetencion: '01',
      tasaRetencion: 0.03,
      company,
      proveedor: client,
      moneda: 'PEN',
      totalRetenido: 450,
      totalPagado: 14550,
      items: [
        {
          tipoDocRelacionado: '01',
          serieDocRelacionado: 'F001',
          correlativoDocRelacionado: 1,
          fechaDocRelacionado: '2026-02-20',
          moneda: 'PEN',
          importeTotal: 15000,
          fechaPago: '2026-02-24',
          importeRetenido: 450,
          importePagado: 14550,
        },
      ],
    };

    const xml = builder.build(data);
    const parsed = parseXml(xml);

    expect(parsed.Retention).toBeDefined();
    expect(parsed.Retention.ID).toBe('R001-00000001');

    // Verify SUNATRetentionSystemCode = 01 (3%)
    expect(parsed.Retention.SUNATRetentionSystemCode).toBe('01');
    expect(parsed.Retention.SUNATRetentionPercent).toBe('3.00');
  });
});

// ── COMPROBANTE DE PERCEPCIÓN (40) ──

describe('SUNAT Beta — Percepción (40)', () => {
  const builder = new PerceptionBuilder();

  it('should generate Perception XML with correct regime', () => {
    const data: XmlPerceptionData = {
      serie: 'P001',
      correlativo: 1,
      fechaEmision: '2026-02-24',
      regimenPercepcion: '01',
      tasaPercepcion: 0.02,
      company,
      cliente: client,
      moneda: 'PEN',
      totalPercibido: 300,
      totalCobrado: 15300,
      items: [
        {
          tipoDocRelacionado: '01',
          serieDocRelacionado: 'F001',
          correlativoDocRelacionado: 2,
          fechaDocRelacionado: '2026-02-20',
          moneda: 'PEN',
          importeTotal: 15000,
          fechaCobro: '2026-02-24',
          importePercibido: 300,
          importeCobrado: 15300,
        },
      ],
    };

    const xml = builder.build(data);
    const parsed = parseXml(xml);

    expect(parsed.Perception).toBeDefined();
    expect(parsed.Perception.ID).toBe('P001-00000001');
    expect(parsed.Perception.SUNATPerceptionSystemCode).toBe('01');
    expect(parsed.Perception.SUNATPerceptionPercent).toBe('2.00');
  });
});

// ── GUÍA DE REMISIÓN (09) ──

describe('SUNAT Beta — Guía de Remisión (09)', () => {
  const builder = new GuideBuilder();

  it('should generate DespatchAdvice XML for private transport', () => {
    const data: XmlGuideData = {
      serie: 'T001',
      correlativo: 1,
      fechaEmision: '2026-02-24',
      fechaTraslado: '2026-02-25',
      motivoTraslado: '01',
      descripcionMotivo: 'Venta',
      modalidadTransporte: '02',
      pesoTotal: 50,
      unidadPeso: 'KGM',
      puntoPartida: { ubigeo: '150101', direccion: 'Almacén Lima' },
      puntoLlegada: { ubigeo: '040101', direccion: 'Sucursal Arequipa' },
      company,
      destinatario: client,
      conductor: {
        tipoDoc: '1',
        numDoc: '12345678',
        nombres: 'JUAN',
        apellidos: 'PEREZ GARCIA',
        licencia: 'Q12345678',
      },
      vehiculo: { placa: 'ABC-123' },
      items: [
        {
          cantidad: 10,
          unidadMedida: 'NIU',
          descripcion: 'Laptop HP ProBook 450',
          codigo: 'LAP001',
        },
      ],
    };

    const xml = builder.build(data);
    const parsed = parseXml(xml);

    expect(parsed.DespatchAdvice).toBeDefined();
    expect(parsed.DespatchAdvice.ID).toBe('T001-00000001');
    expect(parsed.DespatchAdvice.IssueDate).toBe('2026-02-24');

    // Verify DespatchAdviceTypeCode = 09 (may have attributes)
    const typeCode = parsed.DespatchAdvice.DespatchAdviceTypeCode;
    expect(typeof typeCode === 'object' ? typeCode['#text'] : typeCode).toBe('09');
  });

  it('should include IndicadorM1L special instruction when set', () => {
    const data: XmlGuideData = {
      serie: 'T001',
      correlativo: 2,
      fechaEmision: '2026-02-24',
      fechaTraslado: '2026-02-25',
      motivoTraslado: '01',
      modalidadTransporte: '02',
      pesoTotal: 10,
      unidadPeso: 'KGM',
      puntoPartida: { ubigeo: '150101', direccion: 'Lima' },
      puntoLlegada: { ubigeo: '150102', direccion: 'Miraflores' },
      company,
      destinatario: client,
      indicadorM1L: true,
      conductor: {
        tipoDoc: '1',
        numDoc: '12345678',
        nombres: 'JUAN',
        apellidos: 'PEREZ',
      },
      items: [{ cantidad: 1, unidadMedida: 'NIU', descripcion: 'Paquete' }],
    };

    const xml = builder.build(data);
    expect(xml).toContain('SUNAT_Envio_IndicadorTrasladoVehiculoM1L');
  });
});

// ── CROSS-CUTTING VALIDATIONS ──

describe('SUNAT Beta — Cross-cutting XML validations', () => {
  it('all 7 synchronous builders produce well-formed XML with xml declaration', () => {
    const invoiceBuilder = new InvoiceBuilder();
    const creditNoteBuilder = new CreditNoteBuilder();
    const debitNoteBuilder = new DebitNoteBuilder();
    const retentionBuilder = new RetentionBuilder();
    const perceptionBuilder = new PerceptionBuilder();
    const guideBuilder = new GuideBuilder();

    const baseInvoice: XmlInvoiceData = {
      tipoDoc: '01', serie: 'F001', correlativo: 99,
      tipoOperacion: '0101', fechaEmision: '2026-02-24', moneda: 'PEN',
      company, client,
      items: [gravadoItem],
      opGravadas: 12711.86, opExoneradas: 0, opInafectas: 0, opGratuitas: 0,
      igv: 2288.14, isc: 0, icbper: 0, otrosCargos: 0, descuentoGlobal: 0,
      totalVenta: 15000, formaPago: { formaPago: 'Contado' },
      montoEnLetras: 'TEST',
    };

    const xmls = [
      invoiceBuilder.build(baseInvoice),
      creditNoteBuilder.build({
        serie: 'FC01', correlativo: 1, fechaEmision: '2026-02-24', moneda: 'PEN',
        docRefTipo: '01', docRefSerie: 'F001', docRefCorrelativo: 1,
        motivoNota: '01', motivoDescripcion: 'Test',
        company, client, items: [gravadoItem],
        opGravadas: 12711.86, opExoneradas: 0, opInafectas: 0, opGratuitas: 0,
        igv: 2288.14, isc: 0, icbper: 0, totalVenta: 15000,
        montoEnLetras: 'TEST',
      }),
      debitNoteBuilder.build({
        serie: 'FD01', correlativo: 1, fechaEmision: '2026-02-24', moneda: 'PEN',
        docRefTipo: '01', docRefSerie: 'F001', docRefCorrelativo: 1,
        motivoNota: '01', motivoDescripcion: 'Test',
        company, client, items: [gravadoItem],
        opGravadas: 12711.86, opExoneradas: 0, opInafectas: 0, opGratuitas: 0,
        igv: 2288.14, isc: 0, icbper: 0, totalVenta: 15000,
        montoEnLetras: 'TEST',
      }),
      retentionBuilder.build({
        serie: 'R001', correlativo: 1, fechaEmision: '2026-02-24',
        regimenRetencion: '01', tasaRetencion: 0.03, company,
        proveedor: client, moneda: 'PEN', totalRetenido: 450, totalPagado: 14550,
        items: [{
          tipoDocRelacionado: '01', serieDocRelacionado: 'F001', correlativoDocRelacionado: 1,
          fechaDocRelacionado: '2026-02-20', moneda: 'PEN', importeTotal: 15000,
          fechaPago: '2026-02-24', importeRetenido: 450, importePagado: 14550,
        }],
      }),
      perceptionBuilder.build({
        serie: 'P001', correlativo: 1, fechaEmision: '2026-02-24',
        regimenPercepcion: '01', tasaPercepcion: 0.02, company,
        cliente: client, moneda: 'PEN', totalPercibido: 300, totalCobrado: 15300,
        items: [{
          tipoDocRelacionado: '01', serieDocRelacionado: 'F001', correlativoDocRelacionado: 2,
          fechaDocRelacionado: '2026-02-20', moneda: 'PEN', importeTotal: 15000,
          fechaCobro: '2026-02-24', importePercibido: 300, importeCobrado: 15300,
        }],
      }),
      guideBuilder.build({
        serie: 'T001', correlativo: 1, fechaEmision: '2026-02-24',
        fechaTraslado: '2026-02-25', motivoTraslado: '01',
        modalidadTransporte: '02', pesoTotal: 50, unidadPeso: 'KGM',
        puntoPartida: { ubigeo: '150101', direccion: 'Lima' },
        puntoLlegada: { ubigeo: '040101', direccion: 'Arequipa' },
        company, destinatario: client,
        conductor: { tipoDoc: '1', numDoc: '12345678', nombres: 'JUAN', apellidos: 'PEREZ', licencia: 'Q12345678' },
        vehiculo: { placa: 'ABC-123' },
        items: [{ cantidad: 10, unidadMedida: 'NIU', descripcion: 'Test item' }],
      }),
    ];

    for (const xml of xmls) {
      expect(xml).toContain('<?xml version="1.0"');
      // Should parse without throwing
      const parsed = parseXml(xml);
      expect(parsed).toBeDefined();
    }
  });

  it('summary and voided builders produce well-formed XML', () => {
    const summaryBuilder = new SummaryBuilder();
    const voidedBuilder = new VoidedBuilder();

    const summaryXml = summaryBuilder.build({
      correlativo: 1, fechaReferencia: '2026-02-24', fechaEmision: '2026-02-24',
      company, items: [{
        tipoDoc: '03', serie: 'B001', correlativo: 1, clienteTipoDoc: '1',
        clienteNumDoc: '12345678', estado: '1', moneda: 'PEN',
        totalVenta: 100, opGravadas: 84.75, opExoneradas: 0, opInafectas: 0,
        opGratuitas: 0, otrosCargos: 0, igv: 15.25, isc: 0, icbper: 0,
      }],
    });

    const voidedXml = voidedBuilder.build({
      correlativo: 1, fechaReferencia: '2026-02-24', fechaEmision: '2026-02-24',
      company, items: [{
        tipoDoc: '01', serie: 'F001', correlativo: 5, motivo: 'Error datos',
      }],
    });

    expect(summaryXml).toContain('<?xml version="1.0"');
    expect(voidedXml).toContain('<?xml version="1.0"');
    expect(parseXml(summaryXml).SummaryDocuments).toBeDefined();
    expect(parseXml(voidedXml).VoidedDocuments).toBeDefined();
  });
});
