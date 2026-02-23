import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { GuideBuilder } from './guide.builder.js';
import type {
  XmlGuideData,
  XmlCompany,
  XmlClient,
} from '../interfaces/xml-builder.interfaces.js';

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

const destinatario: XmlClient = {
  tipoDocIdentidad: '6',
  numDocIdentidad: '20100000001',
  nombre: 'DESTINATARIO TEST SRL',
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

describe('GuideBuilder', () => {
  const builder = new GuideBuilder();

  function makeGuideData(overrides: Partial<XmlGuideData> = {}): XmlGuideData {
    return {
      serie: 'T001',
      correlativo: 1,
      fechaEmision: '2026-02-23',
      fechaTraslado: '2026-02-24',
      motivoTraslado: '01',
      descripcionMotivo: 'Venta de mercadería',
      modalidadTransporte: '02',
      pesoTotal: 50,
      unidadPeso: 'KGM',
      numeroBultos: 5,
      puntoPartida: { ubigeo: '150101', direccion: 'AV. ORIGEN 100' },
      puntoLlegada: { ubigeo: '150201', direccion: 'AV. DESTINO 200' },
      company,
      destinatario,
      conductor: {
        tipoDoc: '1',
        numDoc: '12345678',
        nombres: 'JUAN',
        apellidos: 'PEREZ',
        licencia: 'Q12345678',
      },
      vehiculo: {
        placa: 'ABC-123',
      },
      items: [
        {
          cantidad: 10,
          unidadMedida: 'NIU',
          descripcion: 'Producto de prueba',
          codigo: 'PROD001',
        },
      ],
      ...overrides,
    };
  }

  it('generates valid XML with DespatchAdvice root element', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    const parsed = parseXml(xml);
    expect(parsed).toHaveProperty('DespatchAdvice');
  });

  it('uses DespatchAdvice namespace', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2');
  });

  it('sets UBLVersionID=2.1 and CustomizationID=2.0', () => {
    const xml = builder.build(makeGuideData());
    const parsed = parseXml(xml);
    const doc = parsed.DespatchAdvice;
    expect(doc.UBLVersionID).toBe('2.1');
    expect(doc.CustomizationID).toBe('2.0');
  });

  it('formats document ID correctly', () => {
    const xml = builder.build(makeGuideData({ correlativo: 15 }));
    const parsed = parseXml(xml);
    expect(parsed.DespatchAdvice.ID).toBe('T001-00000015');
  });

  it('includes IssueDate', () => {
    const xml = builder.build(makeGuideData());
    const parsed = parseXml(xml);
    expect(parsed.DespatchAdvice.IssueDate).toBe('2026-02-23');
  });

  it('includes DespatchAdviceTypeCode = 09 with catalog attributes', () => {
    const xml = builder.build(makeGuideData());
    const parsed = parseXml(xml);
    const typeCode = parsed.DespatchAdvice.DespatchAdviceTypeCode;
    expect(typeCode['#text']).toBe('09');
    expect(typeCode['@_listAgencyName']).toBe('PE:SUNAT');
    expect(typeCode['@_listName']).toBe('Tipo de Documento');
    expect(typeCode['@_listURI']).toBe('urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01');
  });

  it('includes DespatchSupplierParty with company RUC', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('DespatchSupplierParty');
    expect(xml).toContain('20000000001');
  });

  it('includes DeliveryCustomerParty with destinatario data', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('DeliveryCustomerParty');
    expect(xml).toContain('20100000001');
    expect(xml).toContain('DESTINATARIO TEST SRL');
  });

  it('includes Shipment with correct handling code', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('Shipment');
    expect(xml).toContain('HandlingCode');
    expect(xml).toContain('catalogo20');
  });

  it('includes GrossWeightMeasure', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('GrossWeightMeasure');
    expect(xml).toContain('50.000');
    expect(xml).toContain('KGM');
  });

  it('includes transport mode code', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('TransportModeCode');
    expect(xml).toContain('catalogo18');
  });

  it('includes transit period with start date', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('TransitPeriod');
    expect(xml).toContain('2026-02-24');
  });

  it('includes origin and destination addresses', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('DeliveryAddress');
    expect(xml).toContain('150201');
    expect(xml).toContain('AV. DESTINO 200');
    expect(xml).toContain('DespatchAddress');
    expect(xml).toContain('150101');
    expect(xml).toContain('AV. ORIGEN 100');
  });

  it('includes driver data for private transport', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('DriverPerson');
    expect(xml).toContain('12345678');
    expect(xml).toContain('JUAN');
    expect(xml).toContain('PEREZ');
    expect(xml).toContain('Q12345678');
  });

  it('includes vehicle data', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('TransportEquipment');
    expect(xml).toContain('ABC-123');
  });

  it('includes carrier for public transport', () => {
    const xml = builder.build(makeGuideData({
      modalidadTransporte: '01',
      transportista: {
        tipoDoc: '6',
        numDoc: '20300000003',
        nombre: 'TRANSPORTE SAC',
        registroMTC: 'MTC-12345',
      },
      conductor: undefined,
      vehiculo: undefined,
    }));
    expect(xml).toContain('CarrierParty');
    expect(xml).toContain('20300000003');
    expect(xml).toContain('TRANSPORTE SAC');
  });

  it('includes DespatchLine with item details', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('DespatchLine');
    expect(xml).toContain('DeliveredQuantity');
    expect(xml).toContain('10.000');
    expect(xml).toContain('Producto de prueba');
    expect(xml).toContain('OrderLineReference');
  });

  it('includes UBLExtensions and Signature', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('UBLExtensions');
    expect(xml).toContain('SignatureSP');
  });

  it('includes Note when descripcionMotivo is set', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('Venta de mercadería');
  });

  it('includes number of packages', () => {
    const xml = builder.build(makeGuideData());
    expect(xml).toContain('TotalTransportHandlingUnitQuantity');
  });

  it('handles multiple items', () => {
    const data = makeGuideData({
      items: [
        { cantidad: 10, unidadMedida: 'NIU', descripcion: 'Item 1' },
        { cantidad: 5, unidadMedida: 'KGM', descripcion: 'Item 2' },
      ],
    });
    const xml = builder.build(data);
    const matches = xml.match(/DespatchLine/g);
    // Opening + closing = 2 per line = 4
    expect(matches).toHaveLength(4);
  });

  it('handles secondary vehicle plate', () => {
    const xml = builder.build(makeGuideData({
      vehiculo: { placa: 'ABC-123', placaSecundaria: 'XYZ-789' },
    }));
    expect(xml).toContain('ABC-123');
    expect(xml).toContain('XYZ-789');
  });
});
