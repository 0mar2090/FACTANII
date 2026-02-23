import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Sentry error tracking initialization
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    });
  }

  const isProduction = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: isProduction ? 'info' : 'debug',
        ...(isProduction
          ? {
              // Structured JSON logging in production
              formatters: {
                level: (label: string) => ({ level: label }),
              },
              timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
            }
          : {
              // Pretty logging in development
              transport: {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'HH:MM:ss',
                  ignore: 'pid,hostname',
                },
              },
            }),
      },
      trustProxy: true,
      bodyLimit: 10_485_760, // 10MB — XMLs grandes + uploads PFX
    }),
    { bufferLogs: true },
  );

  const configService = app.get(ConfigService);

  // Fastify plugins
  await app.register(multipart, { limits: { fileSize: 5_242_880 } }); // 5MB max for PFX
  await app.register(helmet, { contentSecurityPolicy: false }); // CSP disabled for Swagger UI

  // Prefijo global
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // Validacion global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS
  const corsOrigin = configService.get<string[]>('app.corsOrigin', [
    'http://localhost:3001',
  ]);
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Swagger docs
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('FacturaPE API')
      .setDescription(
        'API de Facturacion Electronica SUNAT — Conexion directa SEE-Del Contribuyente',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port, '0.0.0.0');

  // Enable NestJS shutdown hooks so onModuleDestroy/onApplicationShutdown fire
  app.enableShutdownHooks();

  // Graceful shutdown — drain BullMQ workers before closing
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      console.log('Waiting for in-progress BullMQ jobs to complete...');

      // Set a hard deadline so we don't hang indefinitely
      const forceExitTimeout = setTimeout(() => {
        console.error('Forced exit after 30s shutdown timeout');
        process.exit(1);
      }, 30_000);
      forceExitTimeout.unref();

      try {
        // app.close() triggers NestJS shutdown hooks which close BullMQ workers.
        // BullMQ WorkerHost.onModuleDestroy calls worker.close() which waits
        // for running jobs to finish before resolving.
        await app.close();
        console.log('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    });
  }

  const sunatEnv = configService.get<string>('sunat.env', 'beta');
  console.log(`FacturaPE API running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
  console.log(`SUNAT env: ${sunatEnv}`);
}

bootstrap();
