import { describe, it, expect } from 'vitest';
import { calculateItemTaxes, calculateInvoiceTotals } from '../tax-calculator.js';
import { IGV_RESTAURANT_RATE } from '../../constants/index.js';

describe('IGV MYPE 10% (Ley 31556)', () => {
  it('IGV_RESTAURANT_RATE constant is 0.10', () => {
    expect(IGV_RESTAURANT_RATE).toBe(0.10);
  });

  it('calculates 10% IGV when tasaIGV is 0.10', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '10',
      tasaIGV: IGV_RESTAURANT_RATE,
    });
    expect(result.valorVenta).toBe(100);
    expect(result.igv).toBe(10); // 100 * 0.10
    expect(result.precioUnitario).toBe(110); // 100 * 1.10
    expect(result.totalItem).toBe(110);
  });

  it('defaults to 18% when tasaIGV is not provided', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '10',
    });
    expect(result.igv).toBe(18); // 100 * 0.18
  });

  it('tasaIGV does NOT affect IVAP (tipo 17 always uses 4%)', () => {
    const result = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '17',
      tasaIGV: IGV_RESTAURANT_RATE, // should be ignored for IVAP
    });
    expect(result.igv).toBe(4); // 4% IVAP, not 10%
  });

  it('tasaIGV does NOT affect exonerado/inafecto items', () => {
    const exonerado = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '20',
      tasaIGV: IGV_RESTAURANT_RATE,
    });
    expect(exonerado.igv).toBe(0);

    const inafecto = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 100,
      tipoAfectacion: '30',
      tasaIGV: IGV_RESTAURANT_RATE,
    });
    expect(inafecto.igv).toBe(0);
  });

  it('calculates correct totals with mixed MYPE rates', () => {
    const gravado = calculateItemTaxes({
      cantidad: 2,
      valorUnitario: 50,
      tipoAfectacion: '10',
      tasaIGV: IGV_RESTAURANT_RATE,
    });
    const exonerado = calculateItemTaxes({
      cantidad: 1,
      valorUnitario: 200,
      tipoAfectacion: '20',
      tasaIGV: IGV_RESTAURANT_RATE,
    });

    const totals = calculateInvoiceTotals({
      items: [gravado, exonerado],
      tiposAfectacion: ['10', '20'],
    });

    expect(totals.opGravadas).toBe(100);
    expect(totals.igv).toBe(10); // 100 * 0.10
    expect(totals.opExoneradas).toBe(200);
    expect(totals.totalVenta).toBe(310); // 100 + 200 + 10
  });
});
