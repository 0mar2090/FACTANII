import { describe, it, expect } from 'vitest';
import {
  round2,
  round4,
  isGravado,
  isExonerado,
  isInafecto,
  isExportacion,
  isGratuita,
  isIvap,
  calculateItemTaxes,
  calculateInvoiceTotals,
} from './tax-calculator.js';

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1.004)).toBe(1.0);
    expect(round2(100.999)).toBe(101.0);
    expect(round2(0)).toBe(0);
  });
});

describe('round4', () => {
  it('rounds to 4 decimal places', () => {
    expect(round4(1.00005)).toBe(1.0001);
    expect(round4(1.00004)).toBe(1.0);
    expect(round4(10.12345)).toBe(10.1235);
  });
});

describe('isGravado', () => {
  it('returns true for codes 10-19', () => {
    expect(isGravado('10')).toBe(true);
    expect(isGravado('15')).toBe(true);
    expect(isGravado('17')).toBe(true);
  });

  it('returns false for codes outside 10-19', () => {
    expect(isGravado('20')).toBe(false);
    expect(isGravado('30')).toBe(false);
    expect(isGravado('09')).toBe(false);
  });
});

describe('isExonerado', () => {
  it('returns true for codes 20-29', () => {
    expect(isExonerado('20')).toBe(true);
    expect(isExonerado('21')).toBe(true);
  });

  it('returns false for other codes', () => {
    expect(isExonerado('10')).toBe(false);
    expect(isExonerado('30')).toBe(false);
  });
});

describe('isInafecto', () => {
  it('returns true for codes 30-39', () => {
    expect(isInafecto('30')).toBe(true);
    expect(isInafecto('36')).toBe(true);
  });

  it('returns false for other codes', () => {
    expect(isInafecto('10')).toBe(false);
    expect(isInafecto('40')).toBe(false);
  });
});

describe('isExportacion', () => {
  it('returns true for code 40', () => {
    expect(isExportacion('40')).toBe(true);
  });

  it('returns false for other codes', () => {
    expect(isExportacion('10')).toBe(false);
    expect(isExportacion('30')).toBe(false);
  });
});

describe('isGratuita', () => {
  it('returns true for gratuitous operation codes', () => {
    expect(isGratuita('11')).toBe(true); // retiro premio
    expect(isGratuita('12')).toBe(true); // retiro donación
    expect(isGratuita('15')).toBe(true); // bonificación
    expect(isGratuita('16')).toBe(true); // retiro entrega trabajadores
    expect(isGratuita('21')).toBe(true); // exonerado transferencia gratuita
    expect(isGratuita('31')).toBe(true); // inafecto retiro bonificación
  });

  it('returns false for normal onerosa operations', () => {
    expect(isGratuita('10')).toBe(false); // gravado onerosa
    expect(isGratuita('20')).toBe(false); // exonerado onerosa
    expect(isGratuita('30')).toBe(false); // inafecto onerosa
  });

  it('returns false for IVAP (tipo 17) — IVAP is oneroso, not gratuita', () => {
    expect(isGratuita('17')).toBe(false);
  });
});

describe('isIvap', () => {
  it('returns true only for tipo 17', () => {
    expect(isIvap('17')).toBe(true);
  });

  it('returns false for other gravado types', () => {
    expect(isIvap('10')).toBe(false);
    expect(isIvap('11')).toBe(false);
    expect(isIvap('16')).toBe(false);
  });
});

describe('calculateItemTaxes', () => {
  it('calculates IGV for gravado items (tipoAfectacion 10)', () => {
    const result = calculateItemTaxes({
      cantidad: 2,
      valorUnitario: 100,
      tipoAfectacion: '10',
    });

    expect(result.valorUnitario).toBe(100);
    expect(result.valorVenta).toBe(200); // 2 * 100
    expect(result.igv).toBe(36); // 200 * 0.18
    expect(result.precioUnitario).toBe(118); // 100 * 1.18
    expect(result.isc).toBe(0);
    expect(result.icbper).toBe(0);
    expect(result.descuento).toBe(0);
    expect(result.totalItem).toBe(236); // 200 + 36
  });

  it('calculates zero IGV for exonerado items (tipoAfectacion 20)', () => {
    const result = calculateItemTaxes({
      cantidad: 3,
      valorUnitario: 50,
      tipoAfectacion: '20',
    });

    expect(result.valorVenta).toBe(150);
    expect(result.igv).toBe(0);
    expect(result.precioUnitario).toBe(50);
  });

  it('calculates zero IGV for inafecto items (tipoAfectacion 30)', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 200,
      tipoAfectacion: '30',
    });

    expect(result.igv).toBe(0);
    expect(result.valorVenta).toBe(200);
  });

  it('applies descuento correctly', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '10',
      descuento: 10,
    });

    expect(result.valorVenta).toBe(90); // 100 - 10
    expect(result.igv).toBe(16.2); // 90 * 0.18
    expect(result.descuento).toBe(10);
  });

  it('calculates ICBPER for plastic bags', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 10,
      tipoAfectacion: '10',
      cantidadBolsasPlastico: 3,
    });

    expect(result.icbper).toBe(1.5); // 3 * 0.50
  });

  it('includes ISC in IGV base', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '10',
      isc: 20,
    });

    // Base imponible = valorVenta + ISC = 100 + 20 = 120
    // IGV = 120 * 0.18 = 21.6
    expect(result.isc).toBe(20);
    expect(result.igv).toBe(21.6);
  });

  it('calculates IVAP at 4% for tipo 17 (not 18%)', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '17',
    });

    // IVAP = 100 * 0.04 = 4, NOT 100 * 0.18 = 18
    expect(result.igv).toBe(4);
    expect(result.precioUnitario).toBe(104); // 100 * 1.04
    expect(result.valorVenta).toBe(100);
    expect(result.totalItem).toBe(104); // 100 + 4
  });
});

describe('calculateInvoiceTotals', () => {
  it('classifies items into correct categories and sums totals', () => {
    const items = [
      calculateItemTaxes({ cantidad: 1, valorUnitario: 100, tipoAfectacion: '10' }),
      calculateItemTaxes({ cantidad: 1, valorUnitario: 50, tipoAfectacion: '20' }),
      calculateItemTaxes({ cantidad: 1, valorUnitario: 30, tipoAfectacion: '30' }),
    ];

    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['10', '20', '30'],
    });

    expect(totals.opGravadas).toBe(100);
    expect(totals.opExoneradas).toBe(50);
    expect(totals.opInafectas).toBe(30);
    expect(totals.opGratuitas).toBe(0);
    expect(totals.igv).toBe(18); // only on the gravado item
    // totalVenta = 100 + 50 + 30 + 18 = 198
    expect(totals.totalVenta).toBe(198);
  });

  it('applies descuento global with IGV recalculation on net base', () => {
    const items = [
      calculateItemTaxes({ cantidad: 1, valorUnitario: 100, tipoAfectacion: '10' }),
    ];

    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['10'],
      descuentoGlobal: 10,
    });

    // opGravadas after discount: 100 - 10 = 90
    // IGV recalculated: 90 * 0.18 = 16.2
    // totalVenta = 90 + 16.2 - 10 = 96.2
    expect(totals.descuentoGlobal).toBe(10);
    expect(totals.opGravadas).toBe(90);
    expect(totals.igv).toBe(16.2);
    expect(totals.totalVenta).toBe(96.2);
  });

  it('applies otros cargos', () => {
    const items = [
      calculateItemTaxes({ cantidad: 1, valorUnitario: 100, tipoAfectacion: '10' }),
    ];

    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['10'],
      otrosCargos: 5,
    });

    // totalVenta = 100 + 18 + 5 = 123
    expect(totals.otrosCargos).toBe(5);
    expect(totals.totalVenta).toBe(123);
  });

  it('handles gratuita items — IGV not included in totalVenta', () => {
    const items = [
      calculateItemTaxes({ cantidad: 1, valorUnitario: 100, tipoAfectacion: '10' }),
      calculateItemTaxes({ cantidad: 1, valorUnitario: 50, tipoAfectacion: '11' }), // gratuita
    ];

    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['10', '11'],
    });

    expect(totals.opGravadas).toBe(100);
    expect(totals.opGratuitas).toBe(50);
    // IGV only from oneroso item (100 * 0.18 = 18)
    expect(totals.igv).toBe(18);
    // IGV from gratuita item (50 * 0.18 = 9) tracked separately
    expect(totals.igvGratuitas).toBe(9);
    // totalVenta = opGravadas + igv = 100 + 18 = 118 (no gratuita IGV)
    expect(totals.totalVenta).toBe(118);
  });

  it('IVAP item (tipo 17) is NOT gratuita — contributes to opGravadas and totalVenta', () => {
    const items = [
      calculateItemTaxes({ cantidad: 1, valorUnitario: 100, tipoAfectacion: '17' }), // IVAP
    ];

    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['17'],
    });

    expect(totals.opGravadas).toBe(100);
    expect(totals.opGratuitas).toBe(0);
    expect(totals.igv).toBe(4); // 100 * 0.04 IVAP rate
    expect(totals.igvGratuitas).toBe(0);
    // totalVenta = 100 + 4 = 104
    expect(totals.totalVenta).toBe(104);
  });
});
