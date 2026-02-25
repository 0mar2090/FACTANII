import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { XmlValidatorService } from '../xml-validator.js';
import type { CreateInvoiceDto } from '../../../invoices/dto/create-invoice.dto.js';
import type { CreateCreditNoteDto } from '../../../invoices/dto/create-credit-note.dto.js';
import type { CreateDebitNoteDto } from '../../../invoices/dto/create-debit-note.dto.js';

const validator = new XmlValidatorService();
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ── Helpers ──

function makeItem(overrides: Record<string, any> = {}) {
  return {
    cantidad: 1,
    valorUnitario: 100,
    descripcion: 'Producto de prueba',
    tipoAfectacion: '10',
    unidadMedida: 'NIU',
    ...overrides,
  };
}

function makeFacturaDto(overrides: Partial<CreateInvoiceDto> & Record<string, any> = {}): CreateInvoiceDto {
  return {
    tipoDoc: '01',
    tipoOperacion: '0101',
    fechaEmision: today,
    moneda: 'PEN',
    clienteTipoDoc: '6',
    clienteNumDoc: '20100000002',
    clienteNombre: 'Cliente SAC',
    items: [makeItem()],
    ...overrides,
  } as CreateInvoiceDto;
}

function makeCreditNoteDto(overrides: Partial<CreateCreditNoteDto> & Record<string, any> = {}): CreateCreditNoteDto {
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

function makeDebitNoteDto(overrides: Partial<CreateDebitNoteDto> & Record<string, any> = {}): CreateDebitNoteDto {
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
// Export Invoice Validation
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Export validation', () => {
  it('rejects export tipoOperacion 0200 when items have non-40 tipoAfectacion', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '0200',
        items: [makeItem({ tipoAfectacion: '10' })],
      })),
    );
    const exportErrors = errors.filter((e: any) => e.message?.includes('exportaci'));
    expect(exportErrors.length).toBeGreaterThan(0);
  });

  it('rejects export tipoOperacion 0201 when items have non-40 tipoAfectacion', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '0201',
        items: [makeItem({ tipoAfectacion: '20' })],
      })),
    );
    const exportErrors = errors.filter((e: any) => e.message?.includes('exportaci'));
    expect(exportErrors.length).toBeGreaterThan(0);
  });

  it('rejects export tipoOperacion 0208 when items have non-40 tipoAfectacion', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '0208',
        items: [makeItem({ tipoAfectacion: '30' })],
      })),
    );
    const exportErrors = errors.filter((e: any) => e.message?.includes('exportaci'));
    expect(exportErrors.length).toBeGreaterThan(0);
  });

  it('accepts export tipoOperacion 0200 when all items have tipoAfectacion 40', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '0200',
        items: [makeItem({ tipoAfectacion: '40' })],
      })),
    );
    const exportErrors = errors.filter((e: any) => e.message?.includes('exportaci'));
    expect(exportErrors).toHaveLength(0);
  });

  it('accepts export with multiple items all having tipoAfectacion 40', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '0200',
        items: [
          makeItem({ tipoAfectacion: '40' }),
          makeItem({ tipoAfectacion: '40', descripcion: 'Export item 2' }),
        ],
      })),
    );
    const exportErrors = errors.filter((e: any) => e.message?.includes('exportaci'));
    expect(exportErrors).toHaveLength(0);
  });

  it('rejects export when one of multiple items lacks tipoAfectacion 40', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '0200',
        items: [
          makeItem({ tipoAfectacion: '40' }),
          makeItem({ tipoAfectacion: '10', descripcion: 'Non-export item' }),
        ],
      })),
    );
    const exportErrors = errors.filter((e: any) => e.message?.includes('exportaci'));
    expect(exportErrors.length).toBeGreaterThan(0);
  });

  it('does NOT enforce tipoAfectacion 40 for non-export tipoOperacion', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '0101',
        items: [makeItem({ tipoAfectacion: '10' })],
      })),
    );
    const exportErrors = errors.filter((e: any) => e.message?.includes('exportaci'));
    expect(exportErrors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════
// Credit Note — Invalid motivo
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Credit Note motivo validation', () => {
  it('rejects invalid motivo code 99', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ motivoNota: '99' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoNota')).toBe(true);
  });

  it('rejects invalid motivo code 00', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ motivoNota: '00' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoNota')).toBe(true);
  });

  it('rejects invalid motivo code 14', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ motivoNota: '14' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoNota')).toBe(true);
  });

  it('rejects empty motivo code', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ motivoNota: '' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoNota')).toBe(true);
  });

  it('accepts all 13 valid motivo codes (01 through 13)', () => {
    const validCodes = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];
    for (const code of validCodes) {
      const errors = getErrors(() =>
        validator.validateCreditNote(makeCreditNoteDto({ motivoNota: code })),
      );
      const motivoErrors = errors.filter((e: any) => e.field === 'motivoNota');
      expect(motivoErrors).toHaveLength(0);
    }
  });
});

// ═══════════════════════════════════════════════
// Debit Note — Invalid motivo
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Debit Note motivo validation', () => {
  it('rejects invalid motivo code 04', () => {
    const errors = getErrors(() =>
      validator.validateDebitNote(makeDebitNoteDto({ motivoNota: '04' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoNota')).toBe(true);
  });

  it('rejects invalid motivo code 11', () => {
    const errors = getErrors(() =>
      validator.validateDebitNote(makeDebitNoteDto({ motivoNota: '11' })),
    );
    expect(errors.some((e: any) => e.field === 'motivoNota')).toBe(true);
  });

  it('accepts valid debit motivo codes (01, 02, 03, 10)', () => {
    for (const code of ['01', '02', '03', '10']) {
      const errors = getErrors(() =>
        validator.validateDebitNote(makeDebitNoteDto({ motivoNota: code })),
      );
      const motivoErrors = errors.filter((e: any) => e.field === 'motivoNota');
      expect(motivoErrors).toHaveLength(0);
    }
  });
});

// ═══════════════════════════════════════════════
// Basic passing cases — valid data should NOT throw
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Basic passing cases', () => {
  it('does NOT throw for a valid factura', () => {
    expect(() =>
      validator.validateInvoice(makeFacturaDto()),
    ).not.toThrow();
  });

  it('does NOT throw for a valid boleta', () => {
    expect(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoDoc: '03',
        clienteTipoDoc: '1',
        clienteNumDoc: '12345678',
        clienteNombre: 'JUAN PEREZ',
      }) as CreateInvoiceDto),
    ).not.toThrow();
  });

  it('does NOT throw for a valid credit note', () => {
    expect(() =>
      validator.validateCreditNote(makeCreditNoteDto()),
    ).not.toThrow();
  });

  it('does NOT throw for a valid debit note', () => {
    expect(() =>
      validator.validateDebitNote(makeDebitNoteDto()),
    ).not.toThrow();
  });

  it('does NOT throw for a valid factura with USD currency', () => {
    expect(() =>
      validator.validateInvoice(makeFacturaDto({ moneda: 'USD' })),
    ).not.toThrow();
  });

  it('does NOT throw for a valid factura with EUR currency', () => {
    expect(() =>
      validator.validateInvoice(makeFacturaDto({ moneda: 'EUR' })),
    ).not.toThrow();
  });

  it('does NOT throw for a factura with multiple items', () => {
    expect(() =>
      validator.validateInvoice(makeFacturaDto({
        items: [
          makeItem({ descripcion: 'Item 1' }),
          makeItem({ descripcion: 'Item 2', valorUnitario: 200 }),
          makeItem({ descripcion: 'Item 3', tipoAfectacion: '20' }),
        ],
      })),
    ).not.toThrow();
  });

  it('does NOT throw for a valid credit note referencing a boleta', () => {
    expect(() =>
      validator.validateCreditNote(makeCreditNoteDto({
        docRefTipo: '03',
        clienteTipoDoc: '1',
        clienteNumDoc: '12345678',
      })),
    ).not.toThrow();
  });
});

// ═══════════════════════════════════════════════
// Detraccion validation — tipoOperacion 1001
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Detraccion fields for tipoOperacion 1001', () => {
  it('requires codigoDetraccion when tipoOperacion is 1001', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '1001',
        // codigoDetraccion intentionally omitted
        porcentajeDetraccion: 0.12,
        montoDetraccion: 141.60,
        cuentaDetraccion: '00-000-000001',
      })),
    );
    expect(errors.some((e: any) => e.field === 'codigoDetraccion')).toBe(true);
  });

  it('requires porcentajeDetraccion when tipoOperacion is 1001', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '1001',
        codigoDetraccion: '037',
        // porcentajeDetraccion intentionally omitted
        montoDetraccion: 141.60,
        cuentaDetraccion: '00-000-000001',
      })),
    );
    expect(errors.some((e: any) => e.field === 'porcentajeDetraccion')).toBe(true);
  });

  it('requires montoDetraccion when tipoOperacion is 1001', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '1001',
        codigoDetraccion: '037',
        porcentajeDetraccion: 0.12,
        // montoDetraccion intentionally omitted
        cuentaDetraccion: '00-000-000001',
      })),
    );
    expect(errors.some((e: any) => e.field === 'montoDetraccion')).toBe(true);
  });

  it('requires cuentaDetraccion when tipoOperacion is 1001', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '1001',
        codigoDetraccion: '037',
        porcentajeDetraccion: 0.12,
        montoDetraccion: 141.60,
        // cuentaDetraccion intentionally omitted
      })),
    );
    expect(errors.some((e: any) => e.field === 'cuentaDetraccion')).toBe(true);
  });

  it('rejects invalid detraccion code not in catalog 54', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '1001',
        codigoDetraccion: '999',
        porcentajeDetraccion: 0.12,
        montoDetraccion: 141.60,
        cuentaDetraccion: '00-000-000001',
      })),
    );
    expect(errors.some((e: any) => e.field === 'codigoDetraccion' && e.message?.includes('Invalid'))).toBe(true);
  });

  it('accepts valid complete detraccion with sufficient total', () => {
    // Items: 10 * 100 = 1000 base, 1000 + 180 IGV = 1180 >= 700
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoOperacion: '1001',
        codigoDetraccion: '037',
        porcentajeDetraccion: 0.12,
        montoDetraccion: 141.60,
        cuentaDetraccion: '00-000-000001',
        items: [makeItem({ cantidad: 10, valorUnitario: 100 })],
      })),
    );
    // Should have no detraccion-related errors
    const detErrors = errors.filter((e: any) =>
      e.field === 'codigoDetraccion' ||
      e.field === 'porcentajeDetraccion' ||
      e.field === 'montoDetraccion' ||
      e.field === 'cuentaDetraccion',
    );
    expect(detErrors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════
// Credit Note — motivo 13 amount validation
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Credit Note motivo 13 balance', () => {
  it('rejects when NC amount exceeds montoOriginal for motivo 13', () => {
    // Item: 1 * 1000 = 1000 base amount > montoOriginal (500)
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({
        motivoNota: '13',
        montoOriginal: 500,
        items: [makeItem({ cantidad: 1, valorUnitario: 1000 })],
      })),
    );
    const amountErrors = errors.filter((e: any) => e.message?.includes('exceeds'));
    expect(amountErrors.length).toBeGreaterThan(0);
  });

  it('accepts when NC amount is within montoOriginal for motivo 13', () => {
    // Item: 1 * 100 = 100 base amount <= montoOriginal (500)
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({
        motivoNota: '13',
        montoOriginal: 500,
        items: [makeItem({ cantidad: 1, valorUnitario: 100 })],
      })),
    );
    const amountErrors = errors.filter((e: any) => e.message?.includes('exceeds'));
    expect(amountErrors).toHaveLength(0);
  });

  it('skips balance check when montoOriginal is not provided (even for motivo 13)', () => {
    // Without montoOriginal, the balance check should not apply
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({
        motivoNota: '13',
        items: [makeItem({ cantidad: 1, valorUnitario: 1000 })],
      })),
    );
    const amountErrors = errors.filter((e: any) => e.message?.includes('exceeds'));
    expect(amountErrors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════
// Credit Note — docRefTipo validation
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Credit Note reference document', () => {
  it('rejects when docRefTipo is not 01 or 03', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({ docRefTipo: '07' })),
    );
    expect(errors.some((e: any) => e.field === 'docRefTipo')).toBe(true);
  });

  it('rejects when referencing Factura without RUC client', () => {
    const errors = getErrors(() =>
      validator.validateCreditNote(makeCreditNoteDto({
        docRefTipo: '01',
        clienteTipoDoc: '1',
      })),
    );
    expect(errors.some((e: any) => e.field === 'clienteTipoDoc')).toBe(true);
  });

  it('accepts Boleta reference with DNI client', () => {
    expect(() =>
      validator.validateCreditNote(makeCreditNoteDto({
        docRefTipo: '03',
        clienteTipoDoc: '1',
        clienteNumDoc: '12345678',
      })),
    ).not.toThrow();
  });
});

// ═══════════════════════════════════════════════
// Error collection — multiple errors at once
// ═══════════════════════════════════════════════

describe('XmlValidatorService — Error collection', () => {
  it('collects multiple errors in a single validation call', () => {
    const errors = getErrors(() =>
      validator.validateInvoice(makeFacturaDto({
        tipoDoc: '01',
        clienteTipoDoc: '1', // wrong for factura
        clienteNumDoc: '123', // too short for RUC
        moneda: 'XYZ', // invalid currency
        items: [] as any, // empty items
      })),
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('throws BadRequestException with VALIDATION_ERROR code', () => {
    try {
      validator.validateInvoice(makeFacturaDto({ clienteTipoDoc: '1' }));
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const response = (e as BadRequestException).getResponse() as any;
      expect(response.code).toBe('VALIDATION_ERROR');
      expect(response.message).toBe('Document validation failed');
      expect(Array.isArray(response.errors)).toBe(true);
    }
  });
});
