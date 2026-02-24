import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { XmlValidatorService } from '../xml-validator.js';
import type { CreateRetentionDto } from '../../../invoices/dto/create-retention.dto.js';
import type { CreatePerceptionDto } from '../../../invoices/dto/create-perception.dto.js';

const validator = new XmlValidatorService();
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── Helpers ──

function getErrors(fn: () => void): any[] {
  try {
    fn();
    return [];
  } catch (e) {
    if (e instanceof BadRequestException) {
      const response = e.getResponse() as any;
      return response.errors ?? [];
    }
    throw e;
  }
}

function makeRetentionDto(overrides: Partial<CreateRetentionDto> & Record<string, any> = {}): CreateRetentionDto {
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

function makePerceptionDto(overrides: Partial<CreatePerceptionDto> & Record<string, any> = {}): CreatePerceptionDto {
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

// ═══════════════════════════════════════════════
// Retention Deep Validation
// ═══════════════════════════════════════════════

describe('XmlValidatorService — validateRetention (deep)', () => {

  it('passes with valid retention data', () => {
    expect(() => validator.validateRetention(makeRetentionDto())).not.toThrow();
  });

  describe('regimenRetencion validation', () => {
    it('accepts regime 01 (3%)', () => {
      expect(() => validator.validateRetention(makeRetentionDto({
        regimenRetencion: '01',
      }))).not.toThrow();
    });

    it('accepts regime 02 (6%)', () => {
      expect(() => validator.validateRetention(makeRetentionDto({
        regimenRetencion: '02',
      }))).not.toThrow();
    });

    it('rejects invalid regimenRetencion', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({ regimenRetencion: '03' } as any)),
      );
      const regimeErrors = errors.filter((e: any) => e.field === 'regimenRetencion');
      expect(regimeErrors.length).toBeGreaterThan(0);
    });

    it('rejects regimenRetencion "99"', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({ regimenRetencion: '99' } as any)),
      );
      const regimeErrors = errors.filter((e: any) => e.field === 'regimenRetencion');
      expect(regimeErrors.length).toBeGreaterThan(0);
    });
  });

  describe('items validation', () => {
    it('fails with empty items array', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({ items: [] })),
      );
      const itemErrors = errors.filter((e: any) => e.field === 'items');
      expect(itemErrors.length).toBeGreaterThan(0);
    });

    it('rejects item with tipoDocRelacionado "03" (boleta not valid for retention)', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          items: [{
            tipoDocRelacionado: '03',
            serieDoc: 'B001',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaPago: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field === 'items[0].tipoDocRelacionado');
      expect(docTypeErrors.length).toBeGreaterThan(0);
      expect(docTypeErrors[0].message).toContain('Retention only applies to Facturas');
    });

    it('rejects item with tipoDocRelacionado "07" (NC not valid for retention)', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          items: [{
            tipoDocRelacionado: '07',
            serieDoc: 'FC01',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaPago: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field === 'items[0].tipoDocRelacionado');
      expect(docTypeErrors.length).toBeGreaterThan(0);
    });

    it('rejects item with tipoDocRelacionado "12" (not valid for retention)', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          items: [{
            tipoDocRelacionado: '12',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaPago: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field === 'items[0].tipoDocRelacionado');
      expect(docTypeErrors.length).toBeGreaterThan(0);
    });

    it('accepts item with tipoDocRelacionado "01" (factura is valid for retention)', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          items: [{
            tipoDocRelacionado: '01',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaPago: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field?.includes('tipoDocRelacionado'));
      expect(docTypeErrors).toHaveLength(0);
    });

    it('validates multiple items and reports errors for each invalid one', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          items: [
            {
              tipoDocRelacionado: '01',
              serieDoc: 'F001',
              correlativoDoc: 1,
              fechaDoc: today,
              importeTotal: 500,
              fechaPago: today,
            },
            {
              tipoDocRelacionado: '03',
              serieDoc: 'B001',
              correlativoDoc: 1,
              fechaDoc: today,
              importeTotal: 300,
              fechaPago: today,
            },
          ],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field === 'items[1].tipoDocRelacionado');
      expect(docTypeErrors.length).toBeGreaterThan(0);
      // First item should have no tipoDocRelacionado error
      const firstItemErrors = errors.filter((e: any) => e.field === 'items[0].tipoDocRelacionado');
      expect(firstItemErrors).toHaveLength(0);
    });
  });

  describe('date validation', () => {
    it('rejects invalid fechaDoc format in item', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          items: [{
            tipoDocRelacionado: '01',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: 'not-a-date',
            importeTotal: 500,
            fechaPago: today,
          }],
        })),
      );
      const dateErrors = errors.filter((e: any) => e.field === 'items[0].fechaDoc');
      expect(dateErrors.length).toBeGreaterThan(0);
      expect(dateErrors[0].message).toContain('Invalid date format');
    });

    it('rejects invalid fechaPago format in item', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          items: [{
            tipoDocRelacionado: '01',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaPago: '2026-13-01',
          }],
        })),
      );
      const dateErrors = errors.filter((e: any) => e.field === 'items[0].fechaPago');
      expect(dateErrors.length).toBeGreaterThan(0);
    });

    it('rejects invalid fechaEmision format', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          fechaEmision: 'bad-date',
        })),
      );
      const dateErrors = errors.filter((e: any) =>
        e.field === 'fechaEmision' && e.message?.includes('Invalid date format'),
      );
      expect(dateErrors.length).toBeGreaterThan(0);
    });

    it('rejects impossible date like 2026-02-30', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          items: [{
            tipoDocRelacionado: '01',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: '2026-02-30',
            importeTotal: 500,
            fechaPago: today,
          }],
        })),
      );
      const dateErrors = errors.filter((e: any) => e.field === 'items[0].fechaDoc');
      expect(dateErrors.length).toBeGreaterThan(0);
    });

    it('accepts valid date strings', () => {
      const errors = getErrors(() =>
        validator.validateRetention(makeRetentionDto({
          fechaEmision: today,
          items: [{
            tipoDocRelacionado: '01',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: '2026-01-15',
            importeTotal: 500,
            fechaPago: '2026-02-10',
          }],
        })),
      );
      const dateErrors = errors.filter((e: any) => e.message?.includes('Invalid date format'));
      expect(dateErrors).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════
// Perception Deep Validation
// ═══════════════════════════════════════════════

describe('XmlValidatorService — validatePerception (deep)', () => {

  it('passes with valid perception data', () => {
    expect(() => validator.validatePerception(makePerceptionDto())).not.toThrow();
  });

  describe('regimenPercepcion validation', () => {
    it('accepts regime 01 (2%)', () => {
      expect(() => validator.validatePerception(makePerceptionDto({
        regimenPercepcion: '01',
      }))).not.toThrow();
    });

    it('accepts regime 02 (1%)', () => {
      expect(() => validator.validatePerception(makePerceptionDto({
        regimenPercepcion: '02',
      }))).not.toThrow();
    });

    it('accepts regime 03 (0.5%)', () => {
      expect(() => validator.validatePerception(makePerceptionDto({
        regimenPercepcion: '03',
      }))).not.toThrow();
    });

    it('rejects invalid regimenPercepcion "04"', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({ regimenPercepcion: '04' } as any)),
      );
      const regimeErrors = errors.filter((e: any) => e.field === 'regimenPercepcion');
      expect(regimeErrors.length).toBeGreaterThan(0);
    });

    it('rejects regimenPercepcion "99"', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({ regimenPercepcion: '99' } as any)),
      );
      const regimeErrors = errors.filter((e: any) => e.field === 'regimenPercepcion');
      expect(regimeErrors.length).toBeGreaterThan(0);
    });
  });

  describe('items validation', () => {
    it('fails with empty items array', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({ items: [] })),
      );
      const itemErrors = errors.filter((e: any) => e.field === 'items');
      expect(itemErrors.length).toBeGreaterThan(0);
    });

    it('accepts item with tipoDocRelacionado "01" (factura)', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          items: [{
            tipoDocRelacionado: '01',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaCobro: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field?.includes('tipoDocRelacionado'));
      expect(docTypeErrors).toHaveLength(0);
    });

    it('accepts item with tipoDocRelacionado "03" (boleta)', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          items: [{
            tipoDocRelacionado: '03',
            serieDoc: 'B001',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaCobro: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field?.includes('tipoDocRelacionado'));
      expect(docTypeErrors).toHaveLength(0);
    });

    it('accepts item with tipoDocRelacionado "12" (liquidación de compra)', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          items: [{
            tipoDocRelacionado: '12',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaCobro: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field?.includes('tipoDocRelacionado'));
      expect(docTypeErrors).toHaveLength(0);
    });

    it('rejects item with tipoDocRelacionado "07" (NC not valid for perception)', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          items: [{
            tipoDocRelacionado: '07',
            serieDoc: 'FC01',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaCobro: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field === 'items[0].tipoDocRelacionado');
      expect(docTypeErrors.length).toBeGreaterThan(0);
      expect(docTypeErrors[0].message).toContain('Perception applies to');
    });

    it('rejects item with tipoDocRelacionado "08" (ND not valid for perception)', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          items: [{
            tipoDocRelacionado: '08',
            serieDoc: 'FD01',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaCobro: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field === 'items[0].tipoDocRelacionado');
      expect(docTypeErrors.length).toBeGreaterThan(0);
    });

    it('rejects item with tipoDocRelacionado "13" (not valid for perception)', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          items: [{
            tipoDocRelacionado: '13',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaCobro: today,
          }],
        })),
      );
      const docTypeErrors = errors.filter((e: any) => e.field === 'items[0].tipoDocRelacionado');
      expect(docTypeErrors.length).toBeGreaterThan(0);
    });
  });

  describe('date validation', () => {
    it('rejects invalid fechaDoc format in item', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          items: [{
            tipoDocRelacionado: '01',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: 'invalid',
            importeTotal: 500,
            fechaCobro: today,
          }],
        })),
      );
      const dateErrors = errors.filter((e: any) => e.field === 'items[0].fechaDoc');
      expect(dateErrors.length).toBeGreaterThan(0);
      expect(dateErrors[0].message).toContain('Invalid date format');
    });

    it('rejects invalid fechaCobro format in item', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          items: [{
            tipoDocRelacionado: '01',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: today,
            importeTotal: 500,
            fechaCobro: '2026-00-01',
          }],
        })),
      );
      const dateErrors = errors.filter((e: any) => e.field === 'items[0].fechaCobro');
      expect(dateErrors.length).toBeGreaterThan(0);
    });

    it('rejects invalid fechaEmision format', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          fechaEmision: 'not-valid',
        })),
      );
      const dateErrors = errors.filter((e: any) =>
        e.field === 'fechaEmision' && e.message?.includes('Invalid date format'),
      );
      expect(dateErrors.length).toBeGreaterThan(0);
    });

    it('accepts valid date strings', () => {
      const errors = getErrors(() =>
        validator.validatePerception(makePerceptionDto({
          fechaEmision: today,
          items: [{
            tipoDocRelacionado: '01',
            serieDoc: 'F001',
            correlativoDoc: 1,
            fechaDoc: '2026-01-15',
            importeTotal: 500,
            fechaCobro: '2026-02-10',
          }],
        })),
      );
      const dateErrors = errors.filter((e: any) => e.message?.includes('Invalid date format'));
      expect(dateErrors).toHaveLength(0);
    });
  });
});
