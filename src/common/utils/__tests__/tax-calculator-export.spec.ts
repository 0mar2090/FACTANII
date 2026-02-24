import { describe, it, expect } from 'vitest';
import { calculateItemTaxes, calculateInvoiceTotals, isExportacion } from '../tax-calculator.js';

describe('Export invoice calculations', () => {
  it('isExportacion returns true for tipo 40', () => {
    expect(isExportacion('40')).toBe(true);
  });

  it('isExportacion returns false for tipo 10', () => {
    expect(isExportacion('10')).toBe(false);
  });

  it('isExportacion returns false for tipo 30 (inafecto)', () => {
    expect(isExportacion('30')).toBe(false);
  });

  it('calculates 0% IGV for export items', () => {
    const result = calculateItemTaxes({
      cantidad: 100,
      valorUnitario: 50,
      tipoAfectacion: '40',
    });
    expect(result.igv).toBe(0);
    expect(result.valorVenta).toBe(5000);
    expect(result.precioUnitario).toBe(50); // no IGV added
  });

  it('tracks opExportacion separately from opInafectas', () => {
    const items = [{
      valorUnitario: 50, precioUnitario: 50, valorReferencial: 50, valorVenta: 5000,
      igv: 0, isc: 0, icbper: 0, descuento: 0, totalItem: 5000,
    }];
    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['40'],
      descuentoGlobal: 0,
      otrosCargos: 0,
    });
    expect(totals.opExportacion).toBe(5000);
    expect(totals.opInafectas).toBe(0); // NOT lumped with inafectas
    expect(totals.totalVenta).toBe(5000);
  });

  it('mixed export and gravado items are tracked correctly', () => {
    const exportItem = {
      valorUnitario: 100, precioUnitario: 100, valorReferencial: 100, valorVenta: 1000,
      igv: 0, isc: 0, icbper: 0, descuento: 0, totalItem: 1000,
    };
    const gravadoItem = {
      valorUnitario: 100, precioUnitario: 118, valorReferencial: 118, valorVenta: 1000,
      igv: 180, isc: 0, icbper: 0, descuento: 0, totalItem: 1180,
    };
    const totals = calculateInvoiceTotals({
      items: [exportItem, gravadoItem],
      tiposAfectacion: ['40', '10'],
      descuentoGlobal: 0,
      otrosCargos: 0,
    });
    expect(totals.opExportacion).toBe(1000);
    expect(totals.opGravadas).toBe(1000);
    expect(totals.opInafectas).toBe(0);
    expect(totals.igv).toBe(180);
    expect(totals.totalVenta).toBe(2180);
  });

  it('opExportacion is included in totalVenta', () => {
    const items = [{
      valorUnitario: 200, precioUnitario: 200, valorReferencial: 200, valorVenta: 2000,
      igv: 0, isc: 0, icbper: 0, descuento: 0, totalItem: 2000,
    }];
    const totals = calculateInvoiceTotals({
      items,
      tiposAfectacion: ['40'],
      descuentoGlobal: 100,
      otrosCargos: 50,
    });
    expect(totals.opExportacion).toBe(2000);
    // totalVenta = 2000 + 0 + 0 + 50 - 100 = 1950
    expect(totals.totalVenta).toBe(1950);
  });
});
