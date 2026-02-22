import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Consultations (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/consultas/ruc/:ruc', () => {
    it('should return data for a valid RUC', async () => {
      // SUNAT's own RUC for testing
      const response = await request(app.getHttpServer())
        .get('/api/v1/consultas/ruc/20100066603')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('ruc', '20100066603');
    });

    it('should reject invalid RUC', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/consultas/ruc/12345');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/consultas/dni/:dni', () => {
    it('should reject invalid DNI (less than 8 digits)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/consultas/dni/1234');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/consultas/tipo-cambio', () => {
    it('should return exchange rate data', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/consultas/tipo-cambio')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('fecha');
      expect(response.body.data).toHaveProperty('compra');
      expect(response.body.data).toHaveProperty('venta');
    });

    it('should reject invalid date format', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/consultas/tipo-cambio?fecha=invalid');

      expect(response.status).toBe(400);
    });
  });
});
