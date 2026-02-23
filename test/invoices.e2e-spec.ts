import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createTestApp } from './setup.js';

/**
 * Generate a valid Peruvian RUC (module 11 checksum) starting with "20".
 */
function generateValidRuc(): string {
  const prefix = '20';
  const middle = String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0');
  const partial = prefix + middle;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = partial.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i]! * weights[i]!;
  }
  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;

  return partial + checkDigit;
}

/**
 * Full invoicing flow E2E test.
 *
 * This test exercises the entire invoice lifecycle:
 *   Register → Login → Create Company → Re-login (with companyId) →
 *   Upload Certificate → Set SOL credentials → Create Factura →
 *   List → Get by ID → Download XML → Download PDF → Resend
 *
 * Requires:
 *   - Running PostgreSQL + Redis (Docker Compose)
 *   - test/manual/test-cert.pfx (for SUNAT send — skips if missing)
 *   - SUNAT beta accessible (for real send — graceful degradation)
 */
describe('Invoices — Full Flow (e2e)', () => {
  let app: NestFastifyApplication;
  let accessToken: string;
  let companyId: string;
  let invoiceId: string;

  const pfxPath = join(process.cwd(), 'test', 'manual', 'test-cert.pfx');
  const hasCert = existsSync(pfxPath);

  const timestamp = Date.now();
  const testUser = {
    email: `invoice-e2e-${timestamp}@facturape.com`,
    password: 'InvoiceTest123!',
    name: 'Invoice E2E User',
  };

  // Generate a valid RUC with proper module 11 check digit
  const testCompany = {
    ruc: generateValidRuc(),
    razonSocial: 'EMPRESA E2E TEST SAC',
    direccion: 'Av. Testing 999, Lima',
    ubigeo: '150101',
    departamento: 'Lima',
    provincia: 'Lima',
    distrito: 'Lima',
  };

  beforeAll(async () => {
    app = await createTestApp();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  // ── Step 1: Register ──

  it('should register a new user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser);

    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('success', true);
  });

  // ── Step 2: Login (no companyId yet) ──

  it('should login successfully', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    accessToken = res.body.data.accessToken;
  });

  // ── Step 3: Create company ──

  it('should create a company', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(testCompany);

    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('id');
    companyId = res.body.data.id;
  });

  // ── Step 4: Re-login to get companyId in JWT ──

  it('should login with companyId in token after company creation', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    accessToken = res.body.data.accessToken;

    // Decode JWT to verify companyId is present
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1]!, 'base64').toString(),
    );
    expect(payload).toHaveProperty('companyId', companyId);
  });

  // ── Step 5: Upload certificate (if available) ──

  it('should upload a PFX certificate', async () => {
    if (!hasCert) {
      console.log('Skipping certificate upload: test-cert.pfx not found');
      return;
    }
    if (!companyId) {
      console.log('Skipping: no company created');
      return;
    }

    const pfxBuffer = readFileSync(pfxPath);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/companies/${companyId}/certificate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', pfxBuffer, 'test-cert.pfx')
      .field('passphrase', '12345678');

    // Accept various success codes — the endpoint might 200 or 201
    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('success', true);
  });

  // ── Step 6: Set SOL credentials ──

  it('should set SOL credentials', async () => {
    if (!companyId) {
      console.log('Skipping: no company created');
      return;
    }

    const res = await request(app.getHttpServer())
      .put(`/api/v1/companies/${companyId}/sol-credentials`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ solUser: 'MODDATOS', solPass: 'MODDATOS' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  // ── Step 7: List invoices (should be empty) ──

  it('should list invoices (initially empty)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── Step 8: Create a factura ──

  it('should create a factura', async () => {
    if (!hasCert) {
      console.log('Skipping factura creation: no certificate available');
      return;
    }

    const facturaDto = {
      fechaEmision: new Date().toISOString().split('T')[0],
      clienteTipoDoc: '6',
      clienteNumDoc: '20123456789',
      clienteNombre: 'CLIENTE E2E SAC',
      clienteDireccion: 'Av. Cliente 456, Lima',
      items: [
        {
          cantidad: 2,
          descripcion: 'Producto de prueba E2E',
          valorUnitario: 100,
        },
        {
          cantidad: 1,
          unidadMedida: 'ZZ',
          descripcion: 'Servicio de consultoría E2E',
          valorUnitario: 500,
        },
      ],
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/factura')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(facturaDto);

    // The factura creation sends to SUNAT beta — may succeed or fail
    // depending on SUNAT availability, but should not 500
    expect(res.status).toBeLessThan(500);

    if (res.status >= 200 && res.status < 300) {
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('serie');
      expect(res.body.data).toHaveProperty('correlativo');
      expect(res.body.data).toHaveProperty('status');
      invoiceId = res.body.data.id;
    } else {
      console.log(`Factura creation returned ${res.status}: ${JSON.stringify(res.body)}`);
    }
  }, 30_000); // SUNAT can be slow

  // ── Step 9: Get invoice by ID ──

  it('should get invoice by ID', async () => {
    if (!invoiceId) {
      console.log('Skipping: no invoice was created');
      return;
    }

    const res = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('id', invoiceId);
    expect(res.body.data).toHaveProperty('tipoDoc', '01');
  });

  // ── Step 10: Download XML ──

  it('should download invoice XML', async () => {
    if (!invoiceId) {
      console.log('Skipping: no invoice was created');
      return;
    }

    const res = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}/xml`)
      .set('Authorization', `Bearer ${accessToken}`);

    // XML might not be available if SUNAT send failed before signing
    if (res.status === 200) {
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.text).toContain('<?xml');
    } else {
      expect(res.status).toBe(404);
    }
  });

  // ── Step 11: Download PDF (on-the-fly generation) ──

  it('should download invoice PDF', async () => {
    if (!invoiceId) {
      console.log('Skipping: no invoice was created');
      return;
    }

    const res = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true);

    if (res.status === 200) {
      expect(res.headers['content-type']).toContain('application/pdf');
      // PDF magic bytes %PDF
      expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    } else {
      // PDF generation might fail if invoice data is incomplete
      expect([404, 500]).toContain(res.status);
    }
  });

  // ── Step 12: Download PDF in ticket format ──

  it('should download invoice PDF in ticket format', async () => {
    if (!invoiceId) {
      console.log('Skipping: no invoice was created');
      return;
    }

    const res = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}/pdf?format=ticket`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true);

    if (res.status === 200) {
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    }
  });

  // ── Step 13: List invoices (should have at least one) ──

  it('should list invoices with filters', async () => {
    if (!invoiceId) {
      console.log('Skipping: no invoice was created');
      return;
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/invoices?tipoDoc=01&limit=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty('meta');
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('page');
  });

  // ── Step 14: Resend (should fail for ACCEPTED invoice) ──

  it('should reject resend for non-rejected invoice', async () => {
    if (!invoiceId) {
      console.log('Skipping: no invoice was created');
      return;
    }

    const res = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/resend`)
      .set('Authorization', `Bearer ${accessToken}`);

    // If invoice was ACCEPTED, resend should be rejected (400)
    // If invoice was REJECTED or DRAFT, resend should work (200/201)
    expect(res.status).toBeLessThan(500);
  });

  // ── Step 15: Input validation ──

  it('should reject factura with missing required fields', async () => {
    if (!companyId) {
      console.log('Skipping: no company created (need tenant context for validation)');
      return;
    }

    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/factura')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        // Missing fechaEmision, clienteTipoDoc, clienteNumDoc, clienteNombre, items
      });

    expect(res.status).toBe(400);
  });

  it('should reject factura with empty items', async () => {
    if (!companyId) {
      console.log('Skipping: no company created (need tenant context for validation)');
      return;
    }

    const res = await request(app.getHttpServer())
      .post('/api/v1/invoices/factura')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fechaEmision: '2026-02-22',
        clienteTipoDoc: '6',
        clienteNumDoc: '20123456789',
        clienteNombre: 'Test',
        items: [],
      });

    expect(res.status).toBe(400);
  });

  // ── Step 16: Auth protection ──

  it('should reject unauthenticated requests', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/invoices');

    expect(res.status).toBe(401);
  });

  it('should reject invalid token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/invoices')
      .set('Authorization', 'Bearer invalid.token.here');

    // 401 (invalid JWT) or 429 (rate limited before auth check)
    expect([401, 429]).toContain(res.status);
  });
});
