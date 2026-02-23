import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { XmlValidatorService } from './xml-validator.js';
import type { CreateInvoiceDto } from '../../invoices/dto/create-invoice.dto.js';
import type { CreateCreditNoteDto } from '../../invoices/dto/create-credit-note.dto.js';
import type { CreateDebitNoteDto } from '../../invoices/dto/create-debit-note.dto.js';

const validator = new XmlValidatorService();
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── Helpers ──

function makeItem(overrides = {}) {
  return {
    cantidad: 1,
    valorUnitario: 100,
    descripcion: 'Producto de prueba',
    tipoAfectacion: '10',
    ...overrides,
  };
}

function makeFacturaDto(overrides: Partial<CreateInvoiceDto> = {}): CreateInvoiceDto {
  return {
    tipoDoc: '01',
    fechaEmision: today,
    clienteTipoDoc: '6',
    clienteNumDoc: '20100000001',
    clienteNombre: 'EMPRESA SRL',
    items: [makeItem()],
    ...overrides,
  } as CreateInvoiceDto;
}

function makeBoletaDto(overrides: Partial<CreateInvoiceDto> = {}): CreateInvoiceDto {
  return {
    tipoDoc: '03',
    fechaEmision: today,
    clienteTipoDoc: '1',
    clienteNumDoc: '12345678',
    clienteNombre: 'JUAN PEREZ',
    items: [makeItem()],
    ...overrides,
  } as CreateInvoiceDto;
}

function makeCreditNoteDto(overrides: Partial<CreateCreditNoteDto> = {}): CreateCreditNoteDto {
  return {
    fechaEmision: today,
    clienteTipoDoc: '6',
    clienteNumDoc: '20100000001',
    clienteNombre: 'EMPRESA SRL',
    docRefTipo: '01',
    docRefSerie: 'F001',
    docRefCorrelativo: 1,
    motivoNota: '01',
    motivoDescripcion: 'Anulacion de la operacion',
    items: [makeItem()],
    ...overrides,
  } as CreateCreditNoteDto;
}

function makeDebitNoteDto(overrides: Partial<CreateDebitNoteDto> = {}): CreateDebitNoteDto {
  return {
    fechaEmision: today,
    clienteTipoDoc: '6',
    clienteNumDoc: '20100000001',
    clienteNombre: 'EMPRESA SRL',
    docRefTipo: '01',
    docRefSerie: 'F001',
    docRefCorrelativo: 1,
    motivoNota: '01',
    motivoDescripcion: 'Intereses por mora',
    items: [makeItem()],
    ...overrides,
  } as CreateDebitNoteDto;
}

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

// ═══════════════════════════════════════════════
// Factura Validation
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Factura (01)', () => {
  it('passes for a valid factura', () => {
    expect(() => validator.validateInvoice(makeFacturaDto())).not.toThrow();
  });

  it('requires RUC (tipo doc 6) for factura', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ clienteTipoDoc: '1' })),
    );
    expect(errors.some((e: any) => e.field === 'clienteTipoDoc')).toBe(true);
  });

  it('requires 11-digit RUC for factura', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ clienteNumDoc: '1234567890' })),
    );
    expect(errors.some((e: any) => e.field === 'clienteNumDoc')).toBe(true);
  });

  it('rejects future emission date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 3); // +3 days to avoid timezone edge cases
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ fechaEmision: future.toISOString().slice(0, 10) })),
    );
    expect(errors.some((e: any) => e.field === 'fechaEmision')).toBe(true);
  });

  it('rejects emission date beyond sending window', () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ fechaEmision: old.toISOString().slice(0, 10) })),
    );
    expect(errors.some((e: any) => e.field === 'fechaEmision')).toBe(true);
  });

  it('rejects empty items', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ items: [] as any })),
    );
    expect(errors.some((e: any) => e.field === 'items')).toBe(true);
  });

  it('rejects item with zero quantity', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ items: [makeItem({ cantidad: 0 })] as any })),
    );
    expect(errors.some((e: any) => e.field?.includes('cantidad'))).toBe(true);
  });

  it('rejects item with negative unit price', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ items: [makeItem({ valorUnitario: -5 })] as any })),
    );
    expect(errors.some((e: any) => e.field?.includes('valorUnitario'))).toBe(true);
  });

  it('rejects invalid currency', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ moneda: 'XYZ' })),
    );
    expect(errors.some((e: any) => e.field === 'moneda')).toBe(true);
  });

  it('requires cuotas for Credito payment', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ formaPago: 'Credito', cuotas: [] })),
    );
    expect(errors.some((e: any) => e.field === 'cuotas')).toBe(true);
  });

  it('rejects invalid tipoAfectacion', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({ items: [makeItem({ tipoAfectacion: '99' })] as any })),
    );
    expect(errors.some((e: any) => e.field?.includes('tipoAfectacion'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Boleta Validation
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Boleta (03)', () => {
  it('passes for a valid boleta', () => {
    expect(() => validator.validateInvoice(makeBoletaDto())).not.toThrow();
  });

  it('rejects RUC as client doc type for boleta', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeBoletaDto({ clienteTipoDoc: '6' })),
    );
    expect(errors.some((e: any) => e.field === 'clienteTipoDoc')).toBe(true);
  });

  it('allows DNI for boleta', () => {
    expect(() =>
      validator.validateInvoice(makeBoletaDto({ clienteTipoDoc: '1' })),
    ).not.toThrow();
  });

  it('allows carnet extranjeria for boleta', () => {
    expect(() =>
      validator.validateInvoice(makeBoletaDto({ clienteTipoDoc: '4', clienteNumDoc: '123456789012' })),
    ).not.toThrow();
  });

  it('requires client identification for boleta >S/700', () => {
    // 600 unit value * 1 qty * 1.18 = 708 > 700
    const errors = getErrors(() =>
      validator.validateInvoice(makeBoletaDto({
        clienteTipoDoc: '-',
        clienteNumDoc: '',
        items: [makeItem({ cantidad: 1, valorUnitario: 600 })] as any,
      })),
    );
    expect(errors.some((e: any) => e.field === 'clienteNumDoc')).toBe(true);
  });

  it('allows anonymous client for boleta <=S/700', () => {
    // 500 unit value * 1 qty * 1.18 = 590 <= 700
    expect(() =>
      validator.validateInvoice(makeBoletaDto({
        clienteTipoDoc: '-',
        clienteNumDoc: '00000000',
        items: [makeItem({ cantidad: 1, valorUnitario: 500 })] as any,
      })),
    ).not.toThrow();
  });
});

// ═══════════════════════════════════════════════
// Nota de Crédito Validation
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Nota Crédito (07)', () => {
  it('passes for a valid credit note', () => {
    expect(() => validator.validateCreditNote(makeCreditNoteDto())).not.toThrow();
  });

  it('rejects invalid motivo code', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ motivoNota: '99' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoNota')).toBe(true);
  });

  it('accepts all valid motivo codes (01-13)', () => {
    const validCodes = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];
    for (const code of validCodes) {
      expect(() =>
        validator.validateCreditNote(makeCreditNoteDto({ motivoNota: code })),
      ).not.toThrow();
    }
  });

  it('rejects invalid reference document type', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ docRefTipo: '07' })),
    );
    expect(errors.some((e: any) => e.field === 'docRefTipo')).toBe(true);
  });

  it('allows Factura (01) and Boleta (03) as reference', () => {
    expect(() =>
      validator.validateCreditNote(makeCreditNoteDto({ docRefTipo: '01' })),
    ).not.toThrow();
    expect(() =>
      validator.validateCreditNote(makeCreditNoteDto({
        docRefTipo: '03',
        clienteTipoDoc: '1',
        clienteNumDoc: '12345678',
      })),
    ).not.toThrow();
  });

  it('requires RUC client when referencing Factura', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ docRefTipo: '01', clienteTipoDoc: '1' })),
    );
    expect(errors.some((e: any) => e.field === 'clienteTipoDoc')).toBe(true);
  });

  it('requires motivo description', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ motivoDescripcion: '' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoDescripcion')).toBe(true);
  });

  it('rejects empty items', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ items: [] as any })),
    );
    expect(errors.some((e: any) => e.field === 'items')).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Nota de Débito Validation
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Nota Débito (08)', () => {
  it('passes for a valid debit note', () => {
    expect(() => validator.validateDebitNote(makeDebitNoteDto())).not.toThrow();
  });

  it('rejects invalid motivo code', () => {
    const errors = getErrors(() =>
      validator.validateDebitNote(makeDebitNoteDto({ motivoNota: '99' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoNota')).toBe(true);
  });

  it('accepts all valid debit motivo codes (01, 02, 03, 11)', () => {
    for (const code of ['01', '02', '03', '11']) {
      expect(() =>
        validator.validateDebitNote(makeDebitNoteDto({ motivoNota: code })),
      ).not.toThrow();
    }
  });

  it('rejects invalid reference document type', () => {
    const errors = getErrors(() =>
      validator.validateDebitNote(makeDebitNoteDto({ docRefTipo: '08' })),
    );
    expect(errors.some((e: any) => e.field === 'docRefTipo')).toBe(true);
  });

  it('requires RUC client when referencing Factura', () => {
    const errors = getErrors(() =>
      validator.validateDebitNote(makeDebitNoteDto({ docRefTipo: '01', clienteTipoDoc: '1' })),
    );
    expect(errors.some((e: any) => e.field === 'clienteTipoDoc')).toBe(true);
  });

  it('requires motivo description', () => {
    const errors = getErrors(() =>
      validator.validateDebitNote(makeDebitNoteDto({ motivoDescripcion: '  ' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoDescripcion')).toBe(true);
  });

  it('validates emission date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const errors = getErrors(() =>
      validator.validateDebitNote(makeDebitNoteDto({ fechaEmision: future.toISOString().slice(0, 10) })),
    );
    expect(errors.some((e: any) => e.field === 'fechaEmision')).toBe(true);
  });

  it('validates items', () => {
    const errors = getErrors(() =>
      validator.validateDebitNote(makeDebitNoteDto({
        items: [makeItem({ descripcion: '' })] as any,
      })),
    );
    expect(errors.some((e: any) => e.field?.includes('descripcion'))).toBe(true);
  });

  it('collects multiple errors at once', () => {
    const errors = getErrors(() =>
      validator.validateDebitNote(makeDebitNoteDto({
        motivoNota: '99',
        docRefTipo: '99',
        motivoDescripcion: '',
        items: [] as any,
      })),
    );
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});
