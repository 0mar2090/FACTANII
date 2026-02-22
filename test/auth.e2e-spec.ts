import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { createTestApp } from './setup.js';

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;
  const testUser = {
    email: `test-${Date.now()}@facturape.com`,
    password: 'TestPassword123!',
    name: 'Test User',
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser);

      // Accept either 201 (created) or 200 (ok) — depends on controller implementation
      expect([200, 201]).toContain(response.status);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should reject duplicate email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser);

      expect([400, 409]).toContain(response.status);
    });

    it('should reject invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'Test123!', name: 'Bad' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      expect([200, 201]).toContain(response.status);
      expect(response.body).toHaveProperty('success', true);
      if (response.body.data) {
        expect(response.body.data).toHaveProperty('accessToken');
      }
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: 'WrongPassword!' });

      expect([400, 401]).toContain(response.status);
    });
  });
});
