import { describe, it, expect } from 'vitest';
import { calculateItemTaxes, calculateInvoiceTotals, isIvap } from '../tax-calculator.js';

describe('IVAP (Impuesto Venta Arroz Pilado)', () => {
  it('isIvap returns true for tipo 17', () => {
    expect(isIvap('17')).toBe(true);
  });

  it('isIvap returns false for regular gravado tipo 10', () => {
    expect(isIvap('10')).toBe(false);
  });

  it('calculates 4% IVAP rate for tipo 17', () => {
    const result = calculateItemTaxes({
      cantidad: 100,
      valorUnitario: 10,
      tipoAfectacion: '17',
    });
    expect(result.valorVenta).toBe(1000);
    expect(result.igv).toBe(40); // 4% IVAP, not 18% IGV
  });

  it('aggregates IVAP separately in invoice totals', () => {
    const items = [{
      valorUnitario: 10, precioUnitario: 10.4, valorVenta: 1000,
      igv: 40, isc: 0, icbper: 0, descuento: 0, totalItem: 1040,
    }];
    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['17'],
      descuentoGlobal: 0,
      otrosCargos: 0,
    });
    expect(totals.opIvap).toBe(1000);
    expect(totals.igvIvap).toBe(40);
    expect(totals.opGravadas).toBe(0); // IVAP tracked separately
  });
});
