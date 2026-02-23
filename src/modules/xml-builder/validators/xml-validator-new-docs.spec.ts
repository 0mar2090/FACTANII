import { describe, it, expect } from 'vitest';
import { XmlValidatorService } from './xml-validator.js';
import type { CreateRetentionDto } from '../../invoices/dto/create-retention.dto.js';
import type { CreatePerceptionDto } from '../../invoices/dto/create-perception.dto.js';
import type { CreateGuideDto } from '../../invoices/dto/create-guide.dto.js';

const validator = new XmlValidatorService();
const today = new Date().toISOString().split('T')[0]!;

// ── Helpers ──

function makeRetentionDto(overrides: Partial<CreateRetentionDto> = {}): CreateRetentionDto {
  return {
    fechaEmision: today,
    regimenRetencion: '01',
    proveedorTipoDoc: '6',
    proveedorNumDoc: '20100000001',
    proveedorNombre: 'PROVEEDOR TEST SRL',
    items: [
      {
        tipoDocRelacionado: '01',
        serieDoc: 'F001',
        correlativoDoc: 1,
        fechaDoc: today,
        importeTotal: 1000,
        fechaPago: today,
      },
    ],
    ...overrides,
  } as CreateRetentionDto;
}

function makePerceptionDto(overrides: Partial<CreatePerceptionDto> = {}): CreatePerceptionDto {
  return {
    fechaEmision: today,
    regimenPercepcion: '01',
    clienteTipoDoc: '6',
    clienteNumDoc: '20200000002',
    clienteNombre: 'CLIENTE TEST SRL',
    items: [
      {
        tipoDocRelacionado: '01',
        serieDoc: 'F001',
        correlativoDoc: 1,
        fechaDoc: today,
        importeTotal: 1000,
        fechaCobro: today,
      },
    ],
    ...overrides,
  } as CreatePerceptionDto;
}

function makeGuideDto(overrides: Partial<CreateGuideDto> = {}): CreateGuideDto {
  return {
    fechaEmision: today,
    fechaTraslado: today,
    motivoTraslado: '01',
    docReferencia: { tipoDoc: '01', serieDoc: 'F001', correlativoDoc: 1 },
    modalidadTransporte: '02',
    pesoTotal: 50,
    destinatarioTipoDoc: '6',
    destinatarioNumDoc: '20100000001',
    destinatarioNombre: 'DESTINATARIO TEST SRL',
    puntoPartida: { ubigeo: '150101', direccion: 'AV. ORIGEN 100' },
    puntoLlegada: { ubigeo: '150201', direccion: 'AV. DESTINO 200' },
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
      { cantidad: 10, descripcion: 'Producto de prueba' },
    ],
    ...overrides,
  } as CreateGuideDto;
}

// ═══════════════════════════════════════════════
// Retention Validation
// ═══════════════════════════════════════════════

describe('validateRetention', () => {
  it('passes with valid data', () => {
    expect(() => validator.validateRetention(makeRetentionDto())).not.toThrow();
  });

  it('fails with invalid regime', () => {
    expect(() => validator.validateRetention(makeRetentionDto({
      regimenRetencion: '99',
    } as any))).toThrow('Document validation failed');
  });

  it('fails when proveedor is not RUC', () => {
    expect(() => validator.validateRetention(makeRetentionDto({
      proveedorTipoDoc: '1',
    }))).toThrow('Document validation failed');
  });

  it('fails when RUC is not 11 digits', () => {
    expect(() => validator.validateRetention(makeRetentionDto({
      proveedorNumDoc: '12345',
    }))).toThrow('Document validation failed');
  });

  it('fails with empty items', () => {
    expect(() => validator.validateRetention(makeRetentionDto({
      items: [],
    }))).toThrow('Document validation failed');
  });

  it('fails when item has zero amount', () => {
    expect(() => validator.validateRetention(makeRetentionDto({
      items: [{
        tipoDocRelacionado: '01',
        serieDoc: 'F001',
        correlativoDoc: 1,
        fechaDoc: today,
        importeTotal: 0,
        fechaPago: today,
      }],
    } as any))).toThrow('Document validation failed');
  });
});

// ═══════════════════════════════════════════════
// Perception Validation
// ═══════════════════════════════════════════════

describe('validatePerception', () => {
  it('passes with valid data', () => {
    expect(() => validator.validatePerception(makePerceptionDto())).not.toThrow();
  });

  it('fails with invalid regime', () => {
    expect(() => validator.validatePerception(makePerceptionDto({
      regimenPercepcion: '99',
    } as any))).toThrow('Document validation failed');
  });

  it('fails with empty client document', () => {
    expect(() => validator.validatePerception(makePerceptionDto({
      clienteNumDoc: '',
    }))).toThrow('Document validation failed');
  });

  it('fails with empty items', () => {
    expect(() => validator.validatePerception(makePerceptionDto({
      items: [],
    }))).toThrow('Document validation failed');
  });

  it('fails when item has zero amount', () => {
    expect(() => validator.validatePerception(makePerceptionDto({
      items: [{
        tipoDocRelacionado: '01',
        serieDoc: 'F001',
        correlativoDoc: 1,
        fechaDoc: today,
        importeTotal: 0,
        fechaCobro: today,
      }],
    } as any))).toThrow('Document validation failed');
  });
});

// ═══════════════════════════════════════════════
// Guide Validation
// ═══════════════════════════════════════════════

describe('validateGuide', () => {
  it('passes with valid data (private transport)', () => {
    expect(() => validator.validateGuide(makeGuideDto())).not.toThrow();
  });

  it('passes with valid data (public transport)', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      modalidadTransporte: '01',
      transportista: {
        tipoDoc: '6',
        numDoc: '20300000003',
        nombre: 'TRANSPORTE SAC',
      },
      conductor: undefined,
      vehiculo: undefined,
    }))).not.toThrow();
  });

  it('fails with invalid motivo traslado', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      motivoTraslado: '99',
    }))).toThrow('Document validation failed');
  });

  it('fails with invalid modalidad transporte', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      modalidadTransporte: '99',
    } as any))).toThrow('Document validation failed');
  });

  it('fails when peso is zero', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      pesoTotal: 0,
    }))).toThrow('Document validation failed');
  });

  it('fails when puntoPartida is missing ubigeo', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      puntoPartida: { ubigeo: '', direccion: 'AV. TEST' },
    } as any))).toThrow('Document validation failed');
  });

  it('fails when puntoLlegada is missing direccion', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      puntoLlegada: { ubigeo: '150201', direccion: '' },
    } as any))).toThrow('Document validation failed');
  });

  it('fails when public transport has no transportista', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      modalidadTransporte: '01',
      transportista: undefined,
    }))).toThrow('Document validation failed');
  });

  it('fails when private transport has no conductor', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      modalidadTransporte: '02',
      conductor: undefined,
    }))).toThrow('Document validation failed');
  });

  it('fails when private transport conductor has no licencia', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      modalidadTransporte: '02',
      conductor: {
        tipoDoc: '1',
        numDoc: '12345678',
        nombres: 'JUAN',
        apellidos: 'PEREZ',
        licencia: '',
      },
    } as any))).toThrow('Document validation failed');
  });

  it('fails when private transport has no vehiculo', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      modalidadTransporte: '02',
      vehiculo: undefined,
    }))).toThrow('Document validation failed');
  });

  it('fails with empty items', () => {
    expect(() => validator.validateGuide(makeGuideDto({
      items: [],
    }))).toThrow('Document validation failed');
  });
});
