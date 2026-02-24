import { describe, it, expect } from 'vitest';
import { calculateItemTaxes } from '../tax-calculator.js';

describe('ISC 3 calculation systems', () => {
  it('System 01 — al valor: ISC = valorVenta * tasaISC', () => {
    const result = calculateItemTaxes({
      cantidad: 10,
      valorUnitario: 100,
      tipoAfectacion: '10',
      tipoSistemaISC: '01',
      tasaISC: 0.30,
    });
    expect(result.isc).toBe(300);
    expect(result.igv).toBe(234);
  });

  it('System 02 — específico: ISC = cantidad * montoFijoISC', () => {
    const result = calculateItemTaxes({
      cantidad: 24,
      valorUnitario: 5,
      tipoAfectacion: '10',
      tipoSistemaISC: '02',
      montoFijoISC: 2.50,
    });
    expect(result.isc).toBe(60);
    expect(result.igv).toBe(32.40);
  });

  it('System 03 — al precio de venta al público: ISC = valorVenta * tasa / (1 + tasa)', () => {
    const result = calculateItemTaxes({
      cantidad: 10,
      valorUnitario: 80,
      tipoAfectacion: '10',
      tipoSistemaISC: '03',
      tasaISC: 0.50,
    });
    // ISC = 800 * 0.50 / 1.50 = 266.67
    expect(result.isc).toBeCloseTo(266.67, 1);
  });

  it('defaults to pre-calculated isc when no tipoSistemaISC', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '10',
      isc: 50,
    });
    expect(result.isc).toBe(50);
  });
});
