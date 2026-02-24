import { describe, it, expect } from 'vitest';
import { calculateItemTaxes, isGratuita } from '../tax-calculator.js';

describe('Gratuitous operations', () => {
  it('types 11-16 are gravado-gratuito (IGV calculated, precioUnitario=0)', () => {
    for (const tipo of ['11', '12', '13', '14', '15', '16']) {
      expect(isGratuita(tipo)).toBe(true);
      const result = calculateItemTaxes({
        cantidad: 1,
        valorUnitario: 100,
        tipoAfectacion: tipo,
      });
      expect(result.igv).toBe(18);
      expect(result.precioUnitario).toBe(0);
      // valorReferencial preserves what it would cost (100 * 1.18)
      expect(result.valorReferencial).toBe(118);
    }
  });

  it('types 31-36 are inafecto-gratuito (no IGV, precioUnitario=0)', () => {
    for (const tipo of ['31', '32', '33', '34', '35', '36']) {
      expect(isGratuita(tipo)).toBe(true);
      const result = calculateItemTaxes({
        cantidad: 1,
        valorUnitario: 100,
        tipoAfectacion: tipo,
      });
      expect(result.igv).toBe(0);
      expect(result.precioUnitario).toBe(0);
      // valorReferencial = valorUnitario for non-gravado gratuitas
      expect(result.valorReferencial).toBe(100);
    }
  });

  it('type 21 is exonerado-gratuito (no IGV, precioUnitario=0)', () => {
    expect(isGratuita('21')).toBe(true);
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '21',
    });
    expect(result.igv).toBe(0);
    expect(result.precioUnitario).toBe(0);
    expect(result.valorReferencial).toBe(100);
  });

  it('regular gravado (10) is NOT gratuita', () => {
    expect(isGratuita('10')).toBe(false);
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '10',
    });
    expect(result.igv).toBe(18);
    expect(result.precioUnitario).toBeCloseTo(118, 0);
    // For onerosa, valorReferencial equals precioUnitario
    expect(result.valorReferencial).toBeCloseTo(118, 0);
  });

  it('regular exonerado (20) is NOT gratuita', () => {
    expect(isGratuita('20')).toBe(false);
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '20',
    });
    expect(result.igv).toBe(0);
    expect(result.precioUnitario).toBe(100);
    expect(result.valorReferencial).toBe(100);
  });

  it('gravado-gratuito with quantity > 1 computes correctly', () => {
    const result = calculateItemTaxes({
      cantidad: 5,
      valorUnitario: 200,
      tipoAfectacion: '11',
    });
    expect(result.valorVenta).toBe(1000);
    expect(result.igv).toBe(180);
    expect(result.precioUnitario).toBe(0);
    expect(result.valorReferencial).toBe(236); // 200 * 1.18 = 236
  });
});
