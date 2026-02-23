import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { RetentionBuilder } from './retention.builder.js';
import { PerceptionBuilder } from './perception.builder.js';
import type {
  XmlRetentionData,
  XmlPerceptionData,
  XmlCompany,
  XmlClient,
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

const proveedor: XmlClient = {
  tipoDocIdentidad: '6',
  numDocIdentidad: '20100000001',
  nombre: 'PROVEEDOR TEST SRL',
  direccion: 'JR. PROVEEDOR 456',
};

const cliente: XmlClient = {
  tipoDocIdentidad: '6',
  numDocIdentidad: '20200000002',
  nombre: 'CLIENTE PERCEPCION SAC',
  direccion: 'AV. CLIENTE 789',
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
// Retention Builder (20)
// ═══════════════════════════════════════════════

describe('RetentionBuilder', () => {
  const builder = new RetentionBuilder();

  function makeRetentionData(overrides: Partial<XmlRetentionData> = {}): XmlRetentionData {
    return {
      serie: 'R001',
      correlativo: 1,
      fechaEmision: '2026-02-23',
      regimenRetencion: '01',
      tasaRetencion: 0.03,
      company,
      proveedor,
      items: [
        {
          tipoDocRelacionado: '01',
          serieDocRelacionado: 'F001',
          correlativoDocRelacionado: 1,
          fechaDocRelacionado: '2026-02-20',
          moneda: 'PEN',
          importeTotal: 1000,
          fechaPago: '2026-02-23',
          importeRetenido: 30,
          importePagado: 970,
        },
      ],
      totalRetenido: 30,
      totalPagado: 970,
      moneda: 'PEN',
      ...overrides,
    };
  }

  it('generates valid XML with Retention root element', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('Retention');
  });

  it('uses SUNAT Retention namespace', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('urn:sunat:names:specification:ubl:peru:schema:xsd:Retention-1');
  });

  it('sets UBLVersionID=2.0 and CustomizationID=1.0', () => {
    const xml = builder.build(makeRetentionData());
    const parsed = parseXml(xml);
    const doc = parsed.Retention;
    expect(doc.UBLVersionID).toBe('2.0');
    expect(doc.CustomizationID).toBe('1.0');
  });

  it('formats document ID as serie-correlativo padded to 8 digits', () => {
    const xml = builder.build(makeRetentionData({ correlativo: 42 }));
    const parsed = parseXml(xml);
    expect(parsed.Retention.ID).toBe('R001-00000042');
  });

  it('includes IssueDate', () => {
    const xml = builder.build(makeRetentionData());
    const parsed = parseXml(xml);
    expect(parsed.Retention.IssueDate).toBe('2026-02-23');
  });

  it('includes AgentParty with company RUC', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('AgentParty');
    expect(xml).toContain('20000000001');
    expect(xml).toContain('EMPRESA TEST SAC');
  });

  it('includes ReceiverParty with proveedor data', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('ReceiverParty');
    expect(xml).toContain('20100000001');
    expect(xml).toContain('PROVEEDOR TEST SRL');
  });

  it('includes retention regime code', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('SUNATRetentionSystemCode');
    expect(xml).toContain('>01<');
  });

  it('includes retention percent', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('SUNATRetentionPercent');
    expect(xml).toContain('3.00');
  });

  it('includes total amounts', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('TotalInvoiceAmount');
    expect(xml).toContain('SUNATTotalPaid');
    expect(xml).toContain('SUNATTotalCashed');
  });

  it('includes document reference with correct structure', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('SUNATRetentionDocumentReference');
    expect(xml).toContain('F001-00000001');
    expect(xml).toContain('SUNATRetentionInformation');
    expect(xml).toContain('SUNATRetentionAmount');
    expect(xml).toContain('SUNATNetTotalPaid');
  });

  it('includes UBLExtensions for signature', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('UBLExtensions');
    expect(xml).toContain('ExtensionContent');
  });

  it('includes Signature reference', () => {
    const xml = builder.build(makeRetentionData());
    expect(xml).toContain('SignatureSP');
  });

  it('handles multiple items', () => {
    const data = makeRetentionData({
      items: [
        {
          tipoDocRelacionado: '01',
          serieDocRelacionado: 'F001',
          correlativoDocRelacionado: 1,
          fechaDocRelacionado: '2026-02-20',
          moneda: 'PEN',
          importeTotal: 1000,
          fechaPago: '2026-02-23',
          importeRetenido: 30,
          importePagado: 970,
        },
        {
          tipoDocRelacionado: '01',
          serieDocRelacionado: 'F001',
          correlativoDocRelacionado: 2,
          fechaDocRelacionado: '2026-02-21',
          moneda: 'PEN',
          importeTotal: 500,
          fechaPago: '2026-02-23',
          importeRetenido: 15,
          importePagado: 485,
        },
      ],
      totalRetenido: 45,
      totalPagado: 1455,
    });
    const xml = builder.build(data);
    expect(xml).toContain('F001-00000001');
    expect(xml).toContain('F001-00000002');
  });

  it('includes exchange rate for foreign currency items', () => {
    const data = makeRetentionData({
      items: [
        {
          tipoDocRelacionado: '01',
          serieDocRelacionado: 'F001',
          correlativoDocRelacionado: 1,
          fechaDocRelacionado: '2026-02-20',
          moneda: 'USD',
          importeTotal: 1000,
          fechaPago: '2026-02-23',
          importeRetenido: 30,
          importePagado: 970,
          tipoCambio: 3.75,
        },
      ],
    });
    const xml = builder.build(data);
    expect(xml).toContain('ExchangeRate');
    expect(xml).toContain('SourceCurrencyCode');
    expect(xml).toContain('USD');
    expect(xml).toContain('3.750000');
  });
});

// ═══════════════════════════════════════════════
// Perception Builder (40)
// ═══════════════════════════════════════════════

describe('PerceptionBuilder', () => {
  const builder = new PerceptionBuilder();

  function makePerceptionData(overrides: Partial<XmlPerceptionData> = {}): XmlPerceptionData {
    return {
      serie: 'P001',
      correlativo: 1,
      fechaEmision: '2026-02-23',
      regimenPercepcion: '01',
      tasaPercepcion: 0.02,
      company,
      cliente,
      items: [
        {
          tipoDocRelacionado: '01',
          serieDocRelacionado: 'F001',
          correlativoDocRelacionado: 1,
          fechaDocRelacionado: '2026-02-20',
          moneda: 'PEN',
          importeTotal: 1000,
          fechaCobro: '2026-02-23',
          importePercibido: 20,
          importeCobrado: 1020,
        },
      ],
      totalPercibido: 20,
      totalCobrado: 1020,
      moneda: 'PEN',
      ...overrides,
    };
  }

  it('generates valid XML with Perception root element', () => {
    const xml = builder.build(makePerceptionData());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('Perception');
  });

  it('uses SUNAT Perception namespace', () => {
    const xml = builder.build(makePerceptionData());
    expect(xml).toContain('urn:sunat:names:specification:ubl:peru:schema:xsd:Perception-1');
  });

  it('sets UBLVersionID=2.0 and CustomizationID=1.0', () => {
    const xml = builder.build(makePerceptionData());
    const parsed = parseXml(xml);
    const doc = parsed.Perception;
    expect(doc.UBLVersionID).toBe('2.0');
    expect(doc.CustomizationID).toBe('1.0');
  });

  it('formats document ID correctly', () => {
    const xml = builder.build(makePerceptionData({ correlativo: 5 }));
    const parsed = parseXml(xml);
    expect(parsed.Perception.ID).toBe('P001-00000005');
  });

  it('includes AgentParty with company data', () => {
    const xml = builder.build(makePerceptionData());
    expect(xml).toContain('AgentParty');
    expect(xml).toContain('20000000001');
  });

  it('includes ReceiverParty with client data', () => {
    const xml = builder.build(makePerceptionData());
    expect(xml).toContain('ReceiverParty');
    expect(xml).toContain('20200000002');
    expect(xml).toContain('CLIENTE PERCEPCION SAC');
  });

  it('includes perception regime code', () => {
    const xml = builder.build(makePerceptionData());
    expect(xml).toContain('SUNATPerceptionSystemCode');
  });

  it('includes perception percent', () => {
    const xml = builder.build(makePerceptionData());
    expect(xml).toContain('SUNATPerceptionPercent');
    expect(xml).toContain('2.00');
  });

  it('includes total amounts', () => {
    const xml = builder.build(makePerceptionData());
    expect(xml).toContain('TotalInvoiceAmount');
    expect(xml).toContain('SUNATTotalCashed');
    expect(xml).toContain('SUNATTotalPaid');
  });

  it('includes document reference with correct structure', () => {
    const xml = builder.build(makePerceptionData());
    expect(xml).toContain('SUNATPerceptionDocumentReference');
    expect(xml).toContain('F001-00000001');
    expect(xml).toContain('SUNATPerceptionInformation');
    expect(xml).toContain('SUNATPerceptionAmount');
    expect(xml).toContain('SUNATNetTotalCashed');
  });

  it('includes UBLExtensions and Signature', () => {
    const xml = builder.build(makePerceptionData());
    expect(xml).toContain('UBLExtensions');
    expect(xml).toContain('SignatureSP');
  });
});
