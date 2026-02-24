import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ClsModule } from 'nestjs-cls';

import { allConfigs } from './config/index.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';

// Feature modules — Fase 1
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { CompaniesModule } from './modules/companies/companies.module.js';
import { CertificatesModule } from './modules/certificates/certificates.module.js';

// Feature modules — Fase 2
import { XmlBuilderModule } from './modules/xml-builder/xml-builder.module.js';
import { XmlSignerModule } from './modules/xml-signer/xml-signer.module.js';
import { SunatClientModule } from './modules/sunat-client/sunat-client.module.js';
import { CdrProcessorModule } from './modules/cdr-processor/cdr-processor.module.js';
import { InvoicesModule } from './modules/invoices/invoices.module.js';

// Feature modules — Fase 4
import { QueuesModule } from './modules/queues/queues.module.js';
import { PdfGeneratorModule } from './modules/pdf-generator/pdf-generator.module.js';
import { ConsultationsModule } from './modules/consultations/consultations.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';

// Feature modules — Fase 5
import { HealthModule } from './modules/health/health.module.js';

// Shared infrastructure
import { RedisModule } from './modules/redis/redis.module.js';

// Global guards
import { TenantThrottlerGuard } from './common/guards/tenant-throttler.guard.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { ApiKeyGuard } from './common/guards/api-key.guard.js';
import { TenantGuard } from './common/guards/tenant.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';

// Global filters
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter.js';

// Global interceptors
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor.js';

@Module({
  imports: [
    // Config — carga .env + registerAs configs
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: allConfigs,
    }),

    // CLS — AsyncLocalStorage para multi-tenancy
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),

    // Rate limiting (configurable via RATE_LIMIT_* env vars)
    ThrottlerModule.forRootAsync({
      useFactory: (config: ConfigService) => ([
        {
          name: 'short',
          ttl: config.get<number>('app.rateLimit.shortTtl', 1000),
          limit: config.get<number>('app.rateLimit.shortLimit', 3),
        },
        {
          name: 'medium',
          ttl: config.get<number>('app.rateLimit.mediumTtl', 10_000),
          limit: config.get<number>('app.rateLimit.mediumLimit', 20),
        },
        {
          name: 'long',
          ttl: config.get<number>('app.rateLimit.longTtl', 60_000),
          limit: config.get<number>('app.rateLimit.longLimit', 100),
        },
      ]),
      inject: [ConfigService],
    }),

    // BullMQ queues
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          maxRetriesPerRequest: null,
        },
      }),
      inject: [ConfigService],
    }),

    // Redis — Global shared client for lockout, caching, etc.
    RedisModule,

    // Prisma — Global database access
    PrismaModule,

    // === Feature Modules — Fase 1 ===
    AuthModule,
    UsersModule,
    CompaniesModule,
    CertificatesModule,

    // === Feature Modules — Fase 2 ===
    XmlBuilderModule,
    XmlSignerModule,
    SunatClientModule,
    CdrProcessorModule,
    InvoicesModule,

    // === Feature Modules — Fase 4 ===
    QueuesModule,
    PdfGeneratorModule,
    ConsultationsModule,
    WebhooksModule,
    BillingModule,
    NotificationsModule,

    // === Feature Modules — Fase 5 ===
    HealthModule,
  ],
  providers: [
    // Guard order: TenantThrottlerGuard → JwtAuthGuard → ApiKeyGuard → TenantGuard → RolesGuard
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },

    // Global filters (order: specific → generic → sentry catch-all)
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_FILTER, useClass: SentryExceptionFilter },

    // Global interceptors
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
  ],
})
export class AppModule {}
