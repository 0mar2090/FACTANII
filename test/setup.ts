import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import multipart from '@fastify/multipart';
import { AppModule } from '../src/app.module.js';

/**
 * Creates a fully bootstrapped NestJS test application with Fastify adapter.
 *
 * Mirrors the configuration in main.ts:
 * - Global validation pipe (whitelist, transform, forbidNonWhitelisted)
 * - Global prefix 'api/v1'
 * - Fastify multipart plugin (for file uploads)
 *
 * Usage in E2E tests:
 *   const app = await createTestApp();
 *   // ... run tests with supertest against app.getHttpServer()
 *   await app.close();
 */
export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  // Register Fastify plugins (mirrors main.ts)
  await app.register(multipart, { limits: { fileSize: 5_242_880 } });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api/v1');
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}
