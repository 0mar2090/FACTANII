import { describe, it, expect } from 'vitest';
import { PdfGeneratorService } from './pdf-generator.service.js';
import type { PdfInvoiceData } from './interfaces/pdf-data.interface.js';

const sampleData: PdfInvoiceData = {
  companyRuc: '20000000001',
  companyRazonSocial: 'EMPRESA DE PRUEBA SAC',
  companyDireccion: 'Av. Test 123, Lima',
  companyUbigeo: '150101',
  tipoDoc: '01',
  tipoDocNombre: 'FACTURA ELECTRÓNICA',
  serie: 'F001',
  correlativo: 1,
  fechaEmision: '2026-02-22',
  moneda: 'PEN',
  monedaSimbolo: 'S/',
  clienteTipoDoc: '6',
  clienteNumDoc: '20123456789',
  clienteNombre: 'CLIENTE DE PRUEBA SAC',
  clienteDireccion: 'Calle Cliente 456',
  items: [
    {
      numero: 1,
      cantidad: 2,
      unidadMedida: 'NIU',
      descripcion: 'Producto de prueba',
      valorUnitario: 100,
      igv: 36,
      valorVenta: 200,
    },
    {
      numero: 2,
      cantidad: 1,
      unidadMedida: 'ZZ',
      descripcion: 'Servicio de consultoría',
      valorUnitario: 500,
      igv: 90,
      valorVenta: 500,
    },
  ],
  opGravadas: 700,
  opExoneradas: 0,
  opInafectas: 0,
  igv: 126,
  isc: 0,
  icbper: 0,
  totalVenta: 826,
  montoEnLetras: 'OCHOCIENTOS VEINTISÉIS CON 00/100 SOLES',
  xmlHash: 'abc123def456',
  sunatCode: '0',
  sunatMessage: 'La Factura ha sido aceptada',
  formaPago: 'Contado',
};

describe('PdfGeneratorService', () => {
  const service = new PdfGeneratorService();

  it('generateA4 returns a Buffer with PDF content', async () => {
    const buffer = await service.generateA4(sampleData);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PDF magic bytes: %PDF
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('generateTicket returns a Buffer with PDF content', async () => {
    const buffer = await service.generateTicket(sampleData);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('A4 and ticket produce different sized PDFs', async () => {
    const a4 = await service.generateA4(sampleData);
    const ticket = await service.generateTicket(sampleData);

    // They should both be valid PDFs but different sizes
    expect(a4.length).not.toBe(ticket.length);
  });
});
